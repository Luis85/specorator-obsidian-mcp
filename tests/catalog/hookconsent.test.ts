import { describe, it, expect } from 'vitest'
import { buildHookSummary, detectSyncedVault } from '@/plugin/modals/HookConsentModal'
import { memFs } from './memfs'

describe('buildHookSummary', () => {
  it('surfaces event + exact command for review', async () => {
    const s = await buildHookSummary(memFs(), {
      id: 'session-audit',
      event: 'SessionStart',
      entry: { matcher: '*', command: 'echo audit' },
    })
    expect(s.event).toBe('SessionStart')
    expect(s.command).toBe('echo audit')
    expect(s.warning).toMatch(/runs automatically/i)
    expect(s.syncWarning).toBeUndefined() // clean vault → no sync warning
  })
  it('adds a sync warning when the vault is a git repo', async () => {
    const fs = memFs({ '.git/config': '[core]\n' })
    const s = await buildHookSummary(fs, {
      id: 'session-audit',
      event: 'SessionStart',
      entry: { matcher: '*', command: 'echo audit' },
    })
    expect(s.syncWarning).toMatch(/sync|git|propagat/i)
  })
})

describe('detectSyncedVault', () => {
  it('returns null for a plain vault', async () => {
    expect(await detectSyncedVault(memFs())).toBeNull()
  })
  it('detects a git repo', async () => {
    expect(await detectSyncedVault(memFs({ '.git/config': 'x' }))).toMatch(/git/i)
  })
  it('detects Obsidian Sync', async () => {
    expect(await detectSyncedVault(memFs({ '.obsidian/sync.json': '{}' }))).toMatch(
      /obsidian sync/i,
    )
  })
})
