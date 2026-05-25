import { describe, it, expect } from 'vitest'
import { PermissionGate, type GateDecision } from '@/application/mcp/PermissionGate'
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings'
import { MockConfirmModalPort } from '@/infrastructure/mock/MockConfirmModalPort'
import type { ConfirmModalPort } from '@/domain/ports/ConfirmModalPort'

function makeGate(
  overrides: Partial<PluginSettings> = {},
  modalAnswer: 'allow' | 'allow-session' | 'deny' = 'allow',
) {
  const settings: PluginSettings = { ...DEFAULT_SETTINGS, ...overrides }
  const modal = new MockConfirmModalPort()
  modal.answerWith(modalAnswer)
  const gate = new PermissionGate({ getSettings: () => settings }, modal)
  return { gate, modal, settings }
}

describe('PermissionGate.resolve', () => {
  describe('precedence: pathDenyList > toolModes > defaultMode', () => {
    it('pathDenyList match → deny regardless of mode', async () => {
      const { gate } = makeGate({
        pathDenyList: ['**/private/**'],
        toolModes: { 'vault.write': 'allow' },
      })
      const d = await gate.resolve('vault.write', { path: 'private/secret.md' })
      expect(d.decision).toBe<GateDecision['decision']>('deny')
      expect(d.reason).toContain('pathDenyList')
    })

    it('toolModes override defaultMode', async () => {
      const { gate } = makeGate({ defaultMode: 'deny', toolModes: { 'vault.read': 'allow' } })
      const d = await gate.resolve('vault.read', { path: 'a.md' })
      expect(d.decision).toBe('allow')
    })

    it('defaultMode applied when no override', async () => {
      const { gate } = makeGate({ defaultMode: 'allow', toolModes: {} })
      const d = await gate.resolve('any.tool', {})
      expect(d.decision).toBe('allow')
    })
  })

  describe('ask flow', () => {
    it('ask + modal returns allow → allow', async () => {
      const { gate } = makeGate({ defaultMode: 'ask' }, 'allow')
      const d = await gate.resolve('vault.write', { path: 'a.md' })
      expect(d.decision).toBe('allow')
    })

    it('ask + modal returns deny → deny', async () => {
      const { gate } = makeGate({ defaultMode: 'ask' }, 'deny')
      const d = await gate.resolve('vault.write', { path: 'a.md' })
      expect(d.decision).toBe('deny')
    })

    it('allow-for-session caches subsequent calls for the same tool', async () => {
      const { gate, modal } = makeGate({ defaultMode: 'ask' }, 'allow-session')
      await gate.resolve('vault.write', { path: 'a.md' })
      modal.answerWith('deny') // would deny if asked again
      const second = await gate.resolve('vault.write', { path: 'b.md' })
      expect(second.decision).toBe('allow')
      expect(modal.callCount).toBe(1) // not asked again
    })

    it('ask timeout → deny', async () => {
      const settings: PluginSettings = { ...DEFAULT_SETTINGS, defaultMode: 'ask', askTimeoutMs: 10 }
      const modal = new MockConfirmModalPort()
      modal.neverAnswer()
      const gate = new PermissionGate({ getSettings: () => settings }, modal)
      const d = await gate.resolve('vault.write', { path: 'a.md' })
      expect(d.decision).toBe('deny')
      expect(d.reason).toContain('timeout')
    })

    it('discards late modal answer after timeout (no ghost session-allow)', async () => {
      // Create a controllable modal that resolves on demand, not on call.
      let resolveModal!: (choice: 'allow' | 'allow-session' | 'deny') => void
      const modal: ConfirmModalPort = {
        confirm: () =>
          new Promise((res) => {
            resolveModal = res
          }),
      } as ConfirmModalPort

      const settings: PluginSettings = { ...DEFAULT_SETTINGS, defaultMode: 'ask', askTimeoutMs: 10 }
      const gate = new PermissionGate({ getSettings: () => settings }, modal)

      // First call times out
      const first = await gate.resolve('vault.write', { path: 'a.md' })
      expect(first.decision).toBe('deny')

      // User clicks "allow for session" AFTER the timeout
      resolveModal('allow-session')
      // Give the late .then() a tick to run
      await new Promise((r) => setTimeout(r, 5))

      // Second call must still be ask/deny — not silently allowed from poisoned cache
      let resolveModal2!: (choice: 'allow' | 'allow-session' | 'deny') => void
      ;(
        modal as { confirm: (req: unknown) => Promise<'allow' | 'allow-session' | 'deny'> }
      ).confirm = () =>
        new Promise((res) => {
          resolveModal2 = res
        })
      const secondPromise = gate.resolve('vault.write', { path: 'b.md' })
      resolveModal2('deny')
      const second = await secondPromise
      expect(second.decision).toBe('deny')
    })
  })

  describe('pathDenyList edge cases', () => {
    it('pathDenyList does not block path-less params', async () => {
      const { gate } = makeGate({
        pathDenyList: ['**/private/**'],
        toolModes: { 'cli.execute': 'allow' },
      })
      const d = await gate.resolve('cli.execute', {})
      expect(d.decision).toBe('allow')
    })

    it('pathDenyList matches params.to (vault.move destination)', async () => {
      const { gate } = makeGate({
        pathDenyList: ['.obsidian/**'],
        toolModes: { 'vault.move': 'allow' },
      })
      const d = await gate.resolve('vault.move', {
        path: 'notes/a.md',
        from: 'notes/a.md',
        to: '.obsidian/community-plugins.json',
      })
      expect(d.decision).toBe('deny')
      expect(d.reason).toContain('pathDenyList')
    })

    it('pathDenyList matches params.from', async () => {
      const { gate } = makeGate({
        pathDenyList: ['private/**'],
        toolModes: { 'vault.move': 'allow' },
      })
      const d = await gate.resolve('vault.move', {
        from: 'private/secret.md',
        to: 'public/secret.md',
      })
      expect(d.decision).toBe('deny')
    })

    it('pathDenyList matches commandId (cli.execute)', async () => {
      const { gate } = makeGate({
        pathDenyList: ['**/dangerous-command'],
        toolModes: { 'cli.execute': 'allow' },
      })
      const d = await gate.resolve('cli.execute', { commandId: 'plugins/dangerous-command' })
      expect(d.decision).toBe('deny')
      expect(d.reason).toContain('pathDenyList')
    })

    it('pathDenyList matches folder (bases.list)', async () => {
      const { gate } = makeGate({
        pathDenyList: ['private/**'],
        toolModes: { 'bases.list': 'allow' },
      })
      const d = await gate.resolve('bases.list', { folder: 'private/data' })
      expect(d.decision).toBe('deny')
      expect(d.reason).toContain('pathDenyList')
    })

    it('pathDenyList matches startPath (links.bfs)', async () => {
      const { gate } = makeGate({
        pathDenyList: ['**/secret/**'],
        toolModes: { 'links.bfs': 'allow' },
      })
      const d = await gate.resolve('links.bfs', { startPath: 'projects/secret/note.md' })
      expect(d.decision).toBe('deny')
      expect(d.reason).toContain('pathDenyList')
    })

    it('pathDenyList does NOT match content field (vault.write)', async () => {
      const { gate } = makeGate({
        pathDenyList: ['**/private/**'],
        toolModes: { 'vault.write': 'allow' },
      })
      // content contains a path-like string but should not be inspected by the deny list
      const d = await gate.resolve('vault.write', {
        path: 'safe.md',
        content: '../private/should-not-match',
      })
      expect(d.decision).toBe('allow')
    })
  })

  describe('cli.run prefix allowlist', () => {
    it('cliRunAllowedPrefixes allows a matching command even in deny mode', async () => {
      const { gate } = makeGate({
        defaultMode: 'deny',
        toolModes: { 'cli.run': 'deny' },
        cliRunAllowedPrefixes: ['version', 'help'],
      })
      const d = await gate.resolve('cli.run', { command: 'version' })
      expect(d.decision).toBe('allow')
      expect(d.reason).toBe('cli.run prefix-allowed')
    })

    it('cliRunAllowedPrefixes does NOT allow a non-matching command', async () => {
      const { gate } = makeGate({
        defaultMode: 'deny',
        toolModes: { 'cli.run': 'deny' },
        cliRunAllowedPrefixes: ['version'],
      })
      const d = await gate.resolve('cli.run', { command: 'eval' })
      expect(d.decision).toBe('deny')
    })

    it('cliRunAllowedPrefixes is independent from cliExecuteAllowedPrefixes', async () => {
      // Only cli.run list populated — cli.execute must not be affected
      const { gate } = makeGate({
        defaultMode: 'deny',
        toolModes: { 'cli.run': 'deny', 'cli.execute': 'deny' },
        cliRunAllowedPrefixes: ['version'],
        cliExecuteAllowedPrefixes: [],
      })
      const runDecision = await gate.resolve('cli.run', { command: 'version' })
      expect(runDecision.decision).toBe('allow')

      const execDecision = await gate.resolve('cli.execute', { commandId: 'version:x' })
      expect(execDecision.decision).toBe('deny')
    })

    it('cliRunAllowedPrefixes with shell metacharacter is silently ignored at runtime', async () => {
      // A malicious prefix containing ;rm should not bypass the gate
      const { gate } = makeGate({
        defaultMode: 'deny',
        toolModes: { 'cli.run': 'deny' },
        cliRunAllowedPrefixes: [';rm', 'safe'],
      })
      // The metachar prefix ;rm is stripped at consumption time → only "safe" remains
      const dangerous = await gate.resolve('cli.run', { command: ';rm -rf /' })
      expect(dangerous.decision).toBe('deny')
      // Clean prefix still works
      const safe = await gate.resolve('cli.run', { command: 'safe command' })
      expect(safe.decision).toBe('allow')
      expect(safe.reason).toBe('cli.run prefix-allowed')
    })
  })
})
