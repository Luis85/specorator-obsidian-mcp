import { describe, it, expect } from 'vitest'
import { PermissionGate, type GateDecision } from '@/application/mcp/PermissionGate'
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings'
import { MockConfirmModalPort } from '@/infrastructure/mock/MockConfirmModalPort'

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
  })
})
