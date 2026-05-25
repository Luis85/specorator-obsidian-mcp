import { describe, it, expect, vi } from 'vitest'
import { PermissionGate, type GateAuditor } from '@/application/mcp/PermissionGate'
import { redactParams } from '@/application/catalog/auditlog'
import type { ToolCallAuditEntry } from '@/application/catalog/auditlog'
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings'
import { MockConfirmModalPort } from '@/infrastructure/mock/MockConfirmModalPort'

function makeAuditor() {
  const entries: ToolCallAuditEntry[] = []
  const auditor: GateAuditor = {
    record: vi.fn((entry: ToolCallAuditEntry) => {
      entries.push(entry)
    }),
  }
  return { auditor, entries }
}

function makeGate(
  overrides: Partial<PluginSettings> = {},
  modalAnswer: 'allow' | 'allow-session' | 'deny' = 'allow',
  auditor?: GateAuditor,
) {
  const settings: PluginSettings = { ...DEFAULT_SETTINGS, ...overrides }
  const modal = new MockConfirmModalPort()
  modal.answerWith(modalAnswer)
  const gate = new PermissionGate({ getSettings: () => settings }, modal, auditor)
  return { gate, modal }
}

describe('PermissionGate — audit logging', () => {
  it('stub auditor receives one entry per resolve() call', async () => {
    const { auditor, entries } = makeAuditor()
    const { gate } = makeGate({ toolModes: { 'vault.read': 'allow' } }, 'allow', auditor)

    await gate.resolve('vault.read', { path: 'notes/a.md' })
    expect(auditor.record).toHaveBeenCalledTimes(1)
    expect(entries).toHaveLength(1)
  })

  it('allow path → entry has decision: allow', async () => {
    const { auditor, entries } = makeAuditor()
    const { gate } = makeGate({ toolModes: { 'vault.read': 'allow' } }, 'allow', auditor)

    await gate.resolve('vault.read', { path: 'notes/a.md' })
    expect(entries[0]?.decision).toBe('allow')
    expect(entries[0]?.kind).toBe('tool-call')
    expect(entries[0]?.tool).toBe('vault.read')
  })

  it('deny path → entry has decision: deny', async () => {
    const { auditor, entries } = makeAuditor()
    const { gate } = makeGate({ toolModes: { 'vault.write': 'deny' } }, 'deny', auditor)

    await gate.resolve('vault.write', { path: 'notes/a.md' })
    expect(entries[0]?.decision).toBe('deny')
    expect(entries[0]?.reason).toBeTruthy()
  })

  it('pathDenyList match → entry records deny with reason', async () => {
    const { auditor, entries } = makeAuditor()
    const { gate } = makeGate(
      { pathDenyList: ['**/private/**'], toolModes: { 'vault.write': 'allow' } },
      'allow',
      auditor,
    )

    await gate.resolve('vault.write', { path: 'private/secret.md' })
    expect(entries[0]?.decision).toBe('deny')
    expect(entries[0]?.reason).toContain('pathDenyList')
  })

  it('large content fields are redacted in params', async () => {
    const { auditor, entries } = makeAuditor()
    const { gate } = makeGate({ toolModes: { 'vault.write': 'allow' } }, 'allow', auditor)

    const bigContent = 'x'.repeat(500)
    await gate.resolve('vault.write', { path: 'notes/a.md', content: bigContent })

    const recorded = entries[0]?.params ?? {}
    expect(recorded).not.toHaveProperty('content')
    expect(recorded['path']).toBe('notes/a.md')
  })

  it('gate without auditor still resolves normally (no crash)', async () => {
    const { gate } = makeGate({ toolModes: { 'vault.read': 'allow' } })
    const d = await gate.resolve('vault.read', { path: 'notes/a.md' })
    expect(d.decision).toBe('allow')
  })
})

describe('redactParams', () => {
  it('strips content, body, data fields', () => {
    const result = redactParams({ path: 'a.md', content: 'big blob', body: 'x', data: 'y' })
    expect(result).not.toHaveProperty('content')
    expect(result).not.toHaveProperty('body')
    expect(result).not.toHaveProperty('data')
    expect(result['path']).toBe('a.md')
  })

  it('truncates string values longer than 200 chars', () => {
    const long = 'a'.repeat(300)
    const result = redactParams({ tag: long })
    expect(typeof result['tag']).toBe('string')
    expect((result['tag'] as string).length).toBeLessThanOrEqual(204) // 200 + '…'
    expect((result['tag'] as string).endsWith('…')).toBe(true)
  })

  it('preserves short string values unchanged', () => {
    const result = redactParams({ path: 'notes/a.md', mode: 'create' })
    expect(result['path']).toBe('notes/a.md')
    expect(result['mode']).toBe('create')
  })

  it('preserves non-string values (numbers, booleans, objects)', () => {
    const result = redactParams({ dryRun: true, limit: 42, meta: { x: 1 } })
    expect(result['dryRun']).toBe(true)
    expect(result['limit']).toBe(42)
    expect(result['meta']).toEqual({ x: 1 })
  })
})
