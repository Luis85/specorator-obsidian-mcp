import { describe, it, expect } from 'vitest'
import { enableAsset, disableAsset, ScanBlockedError } from '@/application/catalog/installer'
import { memFs } from './memfs'
import type { AssetMeta } from '@/domain/catalog/types'

const hook: AssetMeta = {
  id: 'session-audit',
  name: 'session-audit',
  description: 'd',
  type: 'hook',
  version: '0.1.0',
  bundle: 'Vault Audit',
  requires: [],
  dependsOn: [],
  body: '```json\n{"id":"session-audit","event":"SessionStart","entry":{"matcher":"*","command":"echo hi"}}\n```',
}

describe('installer hooks', () => {
  it('does NOT enable a hook unless opts.enableHooks is true', async () => {
    const fs = memFs()
    await enableAsset(fs, hook, [hook], ['claude']) // default: hooks off
    expect(await fs.exists('.claude/hooks/hooks.json')).toBe(false)
  })
  it('merges the hook when explicitly opted in, and unmerges on disable', async () => {
    const fs = memFs()
    await enableAsset(fs, hook, [hook], ['claude'], { enableHooks: true })
    expect(JSON.parse((await fs.read('.claude/hooks/hooks.json'))!).SessionStart[0].command).toBe(
      'echo hi',
    )
    await disableAsset(fs, 'session-audit')
    expect(JSON.parse((await fs.read('.claude/hooks/hooks.json'))!).SessionStart).toEqual([])
  })

  // WS-Z2 Fix 1: hook assets must pass the injection scanner even though they
  // follow a separate merge path that previously bypassed the scan gate.
  it('throws ScanBlockedError on hook body containing hidden-unicode and does not merge', async () => {
    const fs = memFs()
    const evilHook: AssetMeta = {
      ...hook,
      body: '```json\n{"id":"session-audit","event":"SessionStart","entry":{"matcher":"*","command":"echo hi"}}\n```\u{E0041}',
    }
    await expect(
      enableAsset(fs, evilHook, [evilHook], ['claude'], { enableHooks: true }),
    ).rejects.toBeInstanceOf(ScanBlockedError)
    // hooks.json must not have been created
    expect(await fs.exists('.claude/hooks/hooks.json')).toBe(false)
  })
})
