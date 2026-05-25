import { describe, it, expect } from 'vitest'
import { enableAsset, updateAsset } from '@/application/catalog/installer'
import { loadState } from '@/application/catalog/sidecar'
import { memFs } from './memfs'
import type { AssetMeta } from '@/domain/catalog/types'

const v1: AssetMeta = {
  id: 'x',
  name: 'x',
  description: 'd',
  type: 'skill',
  version: '0.1.0',
  bundle: 'B',
  requires: [],
  dependsOn: [],
  body: '# Old',
}
const v2: AssetMeta = { ...v1, version: '0.2.0', body: '# New' }
const v3: AssetMeta = { ...v1, version: '0.3.0', body: '# Newer' }
const PATH = '.claude/skills/x/SKILL.md'

const hookV1: AssetMeta = {
  id: 'h',
  name: 'h',
  description: 'd',
  type: 'hook',
  version: '0.1.0',
  bundle: 'B',
  requires: [],
  dependsOn: [],
  body: '```json\n{"id":"h","event":"SessionStart","entry":{"matcher":"*","command":"echo v1"}}\n```',
}
const hookV2: AssetMeta = {
  ...hookV1,
  version: '0.2.0',
  body: '```json\n{"id":"h","event":"SessionStart","entry":{"matcher":"*","command":"echo v2"}}\n```',
}

// Capture the backup paths the update flow reports via its warn sink.
function bakCollector() {
  const baks: string[] = []
  const warn = (m: string) => {
    const at = m.indexOf('backed up at ')
    if (at >= 0)
      for (const p of m.slice(at + 'backed up at '.length).split(', ')) baks.push(p.trim())
  }
  return { baks, warn }
}

describe('updateAsset', () => {
  it('backs up the old file, writes the new version, bumps the record', async () => {
    const fs = memFs()
    const { baks, warn } = bakCollector()
    await enableAsset(fs, v1, [v1], ['claude'])
    await updateAsset(fs, v2, [v2], ['claude'], { warn })
    expect(await fs.read(PATH)).toContain('# New')
    expect((await loadState(fs)).x.version).toBe('0.2.0')
    // a timestamped .bak preserves the old body
    expect(baks.length).toBe(1)
    expect(baks[0]).toMatch(/SKILL\.md\..*\.bak$/)
    expect(await fs.read(baks[0])).toContain('# Old')
  })

  it('rotates .bak files so a second update does not overwrite the first backup', async () => {
    const fs = memFs()
    const { baks, warn } = bakCollector()
    await enableAsset(fs, v1, [v1], ['claude'])
    await updateAsset(fs, v2, [v2], ['claude'], { warn }) // 0.1.0 -> 0.2.0 (backs up # Old)
    await updateAsset(fs, v3, [v3], ['claude'], { warn }) // 0.2.0 -> 0.3.0 (backs up # New)
    expect(baks.length).toBe(2) // both backups retained, distinct paths
    expect(new Set(baks).size).toBe(2) // not clobbered onto the same path
    const bodies = await Promise.all(baks.map((p) => fs.read(p)))
    expect(bodies.join('\n')).toContain('# Old')
    expect(bodies.join('\n')).toContain('# New')
    expect(await fs.read(PATH)).toContain('# Newer')
  })

  it('threads opts so updating a HOOK does not silently drop it', async () => {
    const fs = memFs()
    await enableAsset(fs, hookV1, [hookV1], ['claude'], { enableHooks: true })
    await updateAsset(fs, hookV2, [hookV2], ['claude'], { enableHooks: true })
    const json = JSON.parse((await fs.read('.claude/hooks/hooks.json'))!)
    expect(json.SessionStart[0].command).toBe('echo v2') // still present + updated
    expect((await loadState(fs)).h.version).toBe('0.2.0')
  })

  it('does not throw when the audit record is missing (e.g. hook off / conflict skip)', async () => {
    const fs = memFs()
    await enableAsset(fs, hookV1, [hookV1], ['claude']) // enableHooks omitted → nothing recorded
    // record never created; updateAsset must no-op rather than throw on a missing record
    await expect(updateAsset(fs, hookV2, [hookV2], ['claude'])).resolves.toBeUndefined()
  })

  // Fix 5 (PR #445 P1): hook opt-in must survive a bulk update — the updated
  // hook must remain merged in hooks.json even if the caller omits enableHooks.
  it('Fix5: preserves hook opt-in flag during update (rec.hookEnabled honoured)', async () => {
    const fs = memFs()
    // Install hook v1 WITH explicit opt-in — this persists hookEnabled:true in the record.
    await enableAsset(fs, hookV1, [hookV1], ['claude'], { enableHooks: true })
    // Update WITHOUT passing enableHooks — Fix 5 must restore opt-in from the record.
    await updateAsset(fs, hookV2, [hookV2], ['claude'])
    const json = JSON.parse((await fs.read('.claude/hooks/hooks.json'))!) as Record<
      string,
      unknown[]
    >
    expect(json.SessionStart).toHaveLength(1)
    expect((json.SessionStart[0] as Record<string, unknown>).command).toBe('echo v2')
    // Record must reflect the new version with hookEnabled still true.
    const state = await loadState(fs)
    expect(state.h.version).toBe('0.2.0')
    expect(state.h.hookEnabled).toBe(true)
  })

  // Fix 5 corollary: a hook that was NOT opted in must remain disabled after update.
  it('Fix5: hook not opted-in stays disabled after update', async () => {
    const fs = memFs()
    // Install hook v1 WITHOUT opt-in → record exists but no hooks.json entry.
    // (enableHooks omitted → installHookAsset returns early → no record at all)
    // So updateAsset will no-op (rec === undefined). Use non-hook asset to confirm
    // the non-hook path doesn't accidentally set hookEnabled.
    await enableAsset(fs, v1, [v1], ['claude'])
    await updateAsset(fs, v2, [v2], ['claude'])
    const state = await loadState(fs)
    expect(state.x.hookEnabled).toBeUndefined()
  })

  // Fix 4 (PR #445 P1): if enableAsset throws during the update, the old files
  // and sidecar record must be restored so the user is not left with nothing.
  it('Fix4: restores old files + sidecar record when re-enable fails mid-update', async () => {
    const fs = memFs()
    await enableAsset(fs, v1, [v1], ['claude'])
    // Stub the enable write to fail so the new SKILL.md is never fully written.
    fs.failOn(PATH)
    await expect(updateAsset(fs, v2, [v2], ['claude'])).rejects.toThrow(/simulated write failure/)
    // Old file content must be restored.
    expect(await fs.read(PATH)).toContain('# Old')
    // Old sidecar record must be present with original version.
    const state = await loadState(fs)
    expect(Object.hasOwn(state, 'x')).toBe(true)
    expect(state.x.version).toBe('0.1.0')
  })
})
