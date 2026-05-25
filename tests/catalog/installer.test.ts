import { describe, it, expect, vi } from 'vitest'
import { enableAsset, disableAsset, ScanBlockedError } from '@/application/catalog/installer'
import { loadState } from '@/application/catalog/sidecar'
import { memFs } from './memfs'
import type { AssetMeta } from '@/domain/catalog/types'

const asset: AssetMeta = {
  id: 'auditing-vault',
  name: 'auditing-vault',
  description: 'd',
  type: 'skill',
  version: '0.1.0',
  bundle: 'Vault Audit',
  requires: [],
  dependsOn: [],
  body: '# Body\nRun the audit.',
}
const PATH = '.claude/skills/auditing-vault/SKILL.md'

describe('installer', () => {
  it('writes the asset and records it', async () => {
    const fs = memFs()
    await enableAsset(fs, asset, [asset], ['claude'])
    expect(await fs.read(PATH)).toContain('Run the audit.')
    const state = await loadState(fs)
    expect(state['auditing-vault'].paths).toEqual([PATH])
  })

  it('refuses to clobber an untracked existing file', async () => {
    const fs = memFs({ [PATH]: 'USER CONTENT' })
    await expect(enableAsset(fs, asset, [asset], ['claude'])).rejects.toThrow(/conflict/i)
    expect(await fs.read(PATH)).toBe('USER CONTENT')
  })

  it('disable removes only tracked files and the record', async () => {
    const fs = memFs()
    await enableAsset(fs, asset, [asset], ['claude'])
    await disableAsset(fs, 'auditing-vault')
    expect(await fs.exists(PATH)).toBe(false)
    expect(await loadState(fs)).toEqual({})
  })

  // Decision 4 / B3: the scan gate runs INSIDE enableAsset before any write.
  it('throws ScanBlockedError on hidden-unicode content and writes nothing', async () => {
    const fs = memFs()
    const evil: AssetMeta = { ...asset, body: 'ok\u{E0041}\u{E0042}' }
    await expect(enableAsset(fs, evil, [evil], ['claude'])).rejects.toBeInstanceOf(ScanBlockedError)
    expect(await fs.exists(PATH)).toBe(false)
    expect(await loadState(fs)).toEqual({})
  })

  // H2 / Decision 2: description with a colon and comma round-trips via YAML stringify.
  it('renders a description containing a colon and comma as valid YAML', async () => {
    const fs = memFs()
    const tricky: AssetMeta = {
      ...asset,
      description: 'Audits a vault: orphans, links, and tags. Use when: cleaning up.',
    }
    await enableAsset(fs, tricky, [tricky], ['claude'])
    const written = (await fs.read(PATH))!
    const { parse: parseYaml } = await import('yaml')
    const fmText = /^---\n([\s\S]*?)\n---\n/.exec(written)![1]
    const fm = parseYaml(fmText)
    expect(fm.description).toBe('Audits a vault: orphans, links, and tags. Use when: cleaning up.')
    expect(fm.name).toBe('auditing-vault')
  })

  // WS-Z2 Fix 3: enabling an asset with destructive requires must invalidate
  // the session-allow cache for those tools via the optional gate reference.
  it('calls gate.invalidateSessionAllow for each destructive tool in a.requires', async () => {
    const fs = memFs()
    const writeAsset: AssetMeta = {
      ...asset,
      id: 'write-asset',
      name: 'write-asset',
      requires: ['vault_write', 'vault_read'], // vault_write is destructive; vault_read is not
    }
    const gate = { invalidateSessionAllow: vi.fn() }
    await enableAsset(fs, writeAsset, [writeAsset], ['claude'], { gate })
    // Only the destructive tool should trigger invalidation
    expect(gate.invalidateSessionAllow).toHaveBeenCalledWith('vault_write')
    expect(gate.invalidateSessionAllow).not.toHaveBeenCalledWith('vault_read')
  })

  it('does not throw when gate is absent (backward-compatible)', async () => {
    const fs = memFs()
    await expect(enableAsset(fs, asset, [asset], ['claude'])).resolves.toBeDefined()
  })

  // H1: a shared dependency installed in the same call must be visible to later
  // assets (state is refreshed each iteration) so it is not reinstalled/duplicated.
  it('installs a shared dependency exactly once across the order', async () => {
    const fs = memFs()
    const dep: AssetMeta = { ...asset, id: 'scanning-links', name: 'scanning-links', dependsOn: [] }
    const root: AssetMeta = {
      ...asset,
      id: 'auditing-vault',
      name: 'auditing-vault',
      dependsOn: ['scanning-links'],
    }
    await enableAsset(fs, root, [root, dep], ['claude'])
    const state = await loadState(fs)
    expect(Object.keys(state).sort()).toEqual(['auditing-vault', 'scanning-links'])
    // Enabling again is a no-op (both already tracked, state refreshed each loop).
    await enableAsset(fs, root, [root, dep], ['claude'])
    expect(Object.keys(await loadState(fs)).sort()).toEqual(['auditing-vault', 'scanning-links'])
  })

  // H4 / Decision 5: per-asset atomic rollback. The SKILL.md write succeeds, the
  // record (sidecar) write then fails → the SKILL.md is removed and no record
  // remains. This keeps Phase 1's single-platform mapper untouched while still
  // proving the rollback path. (A multi-platform "write A ok, write B fails →
  // remove A" variant lands in Phase 2 when the mapper fans out.)
  it("rolls back the asset's file when the record write fails", async () => {
    const fs = memFs()
    const A = '.claude/skills/auditing-vault/SKILL.md'
    fs.failOn('.specorator/installed.json')
    await expect(enableAsset(fs, asset, [asset], ['claude'])).rejects.toThrow(
      /simulated write failure/,
    )
    expect(await fs.exists(A)).toBe(false) // rolled back
    expect(await loadState(fs)).toEqual({})
  })
})
