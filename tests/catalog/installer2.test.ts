import { describe, it, expect } from 'vitest'
import {
  enableAsset,
  disableAsset,
  ConflictError,
  ScanBlockedError,
} from '@/application/catalog/installer'
import { loadState } from '@/application/catalog/sidecar'
import { parse as parseYaml } from 'yaml'
import { GEMINI_MANIFEST_PATH } from '@/application/catalog/gemini'
import { memFs } from './memfs'
import type { AssetMeta } from '@/domain/catalog/types'

const cmd: AssetMeta = {
  id: 'audit-vault',
  name: 'audit-vault',
  description: 'd',
  type: 'command',
  version: '0.1.0',
  bundle: 'Vault Audit',
  requires: [],
  dependsOn: [],
  body: '# Run audit',
}

describe('installer (phase 2)', () => {
  it('writes a command to claude + gemini with correct formats', async () => {
    const fs = memFs()
    await enableAsset(fs, cmd, [cmd], ['claude', 'gemini'])
    // R5: Claude command now carries frontmatter; the body is still present.
    const claudeCmd = (await fs.read('.claude/commands/audit-vault.md'))!
    expect(claudeCmd.startsWith('---\n')).toBe(true)
    expect(claudeCmd.trim().endsWith('# Run audit')).toBe(true)
    expect(await fs.read('.gemini/extensions/specorator/commands/audit-vault.toml')).toContain(
      'prompt =',
    )
    const state = await loadState(fs)
    // 2 platform files + the Gemini manifest (B6) are all tracked for uninstall
    expect(state['audit-vault'].paths).toContain('.claude/commands/audit-vault.md')
    expect(state['audit-vault'].paths).toContain(
      '.gemini/extensions/specorator/commands/audit-vault.toml',
    )
    expect(state['audit-vault'].paths).toContain(GEMINI_MANIFEST_PATH)
  })

  // R2: the scan gate is preserved in the Phase 2 installer too.
  it('R2: hard-blocks hidden-unicode content before any write (ScanBlockedError)', async () => {
    const fs = memFs()
    const evil: AssetMeta = { ...cmd, id: 'evil', name: 'evil', body: 'ok\u{E0041}\u{E0042}' }
    await expect(enableAsset(fs, evil, [evil], ['claude'])).rejects.toBeInstanceOf(ScanBlockedError)
    expect(await fs.exists('.claude/commands/evil.md')).toBe(false)
    expect(await loadState(fs)).toEqual({})
  })

  it('B6: emits gemini-extension.json so Gemini registers the extension', async () => {
    const fs = memFs()
    await enableAsset(fs, cmd, [cmd], ['gemini'])
    const manifest = JSON.parse((await fs.read(GEMINI_MANIFEST_PATH))!) as Record<string, unknown>
    expect(manifest.name).toBe('specorator')
    // uninstall removes the manifest too
    await disableAsset(fs, 'audit-vault')
    expect(await fs.exists(GEMINI_MANIFEST_PATH)).toBe(false)
  })

  // Fix 2 (PR #444 P1): manifest must survive while a second Gemini asset is
  // still installed; only removed with the last one.
  it('Fix2: gemini manifest survives disable of first asset, removed with last', async () => {
    const fs = memFs()
    const cmd2: AssetMeta = {
      ...cmd,
      id: 'audit-vault-2',
      name: 'audit-vault-2',
    }
    await enableAsset(fs, cmd, [cmd, cmd2], ['gemini'])
    await enableAsset(fs, cmd2, [cmd, cmd2], ['gemini'])
    // Both installed → manifest exists
    expect(await fs.exists(GEMINI_MANIFEST_PATH)).toBe(true)
    // Disable first asset → manifest must remain (cmd2 still needs it)
    await disableAsset(fs, 'audit-vault')
    expect(await fs.exists(GEMINI_MANIFEST_PATH)).toBe(true)
    // Disable second asset → manifest must now be removed
    await disableAsset(fs, 'audit-vault-2')
    expect(await fs.exists(GEMINI_MANIFEST_PATH)).toBe(false)
  })

  it('H5: routes an untracked-file conflict through onConflict (overwrite)', async () => {
    const fs = memFs({ '.claude/commands/audit-vault.md': 'USER' })
    const seen: string[] = []
    await enableAsset(fs, cmd, [cmd], ['claude'], {
      onConflict: async (p) => {
        seen.push(p)
        return 'overwrite'
      },
    })
    expect(seen).toEqual(['.claude/commands/audit-vault.md'])
    // The installer writes rendered content (frontmatter + body), not the raw body.
    const written = (await fs.read('.claude/commands/audit-vault.md'))!
    expect(written.startsWith('---\n')).toBe(true)
    expect(written.trim().endsWith('# Run audit')).toBe(true)
  })

  it("H5: onConflict 'skip' leaves the user's file and records nothing for it", async () => {
    const fs = memFs({ '.claude/commands/audit-vault.md': 'USER' })
    await enableAsset(fs, cmd, [cmd], ['claude'], { onConflict: async () => 'skip' })
    expect(await fs.read('.claude/commands/audit-vault.md')).toBe('USER')
  })

  it('H5: still throws ConflictError when no onConflict callback is supplied', async () => {
    const fs = memFs({ '.claude/commands/audit-vault.md': 'USER' })
    await expect(enableAsset(fs, cmd, [cmd], ['claude'])).rejects.toBeInstanceOf(ConflictError)
  })

  it('H4/Decision 5: rolls back platform A when platform B conflicts mid-asset', async () => {
    // gemini path is free; claude path is pre-occupied by an untracked file.
    const fs = memFs({ '.claude/commands/audit-vault.md': 'USER' })
    await expect(
      // platforms ordered so gemini writes first, then claude conflicts
      enableAsset(fs, cmd, [cmd], ['gemini', 'claude']),
    ).rejects.toBeInstanceOf(ConflictError)
    // the gemini file written before the conflict must be removed (atomic per asset)
    expect(await fs.exists('.gemini/extensions/specorator/commands/audit-vault.toml')).toBe(false)
    expect(await fs.exists(GEMINI_MANIFEST_PATH)).toBe(false)
    // and no sidecar record was saved
    expect(await loadState(fs)).toEqual({})
    // the user's pre-existing file is untouched
    expect(await fs.read('.claude/commands/audit-vault.md')).toBe('USER')
  })

  // Fix 1 (PR #444 P1): agent type on codex-only has no mapping (H7) → 0 files
  // written → no sidecar record and no audit entry must be emitted.
  it('Fix1: skips sidecar record + audit when no files are written (codex + agent type)', async () => {
    const fs = memFs()
    const agent: AssetMeta = {
      ...cmd,
      id: 'my-agent',
      name: 'my-agent',
      type: 'agent',
    }
    // codex has no agent mapping (H7) → targets array filters to [] → paths stays []
    await enableAsset(fs, agent, [agent], ['codex'])
    const state = await loadState(fs)
    expect(Object.hasOwn(state, 'my-agent')).toBe(false)
    // audit log must also be absent
    expect(await fs.exists('.specorator/audit.jsonl')).toBe(false)
  })

  it('B4/R5: surfaces destructive requires and injects least-privilege allowed-tools into frontmatter', async () => {
    const fs = memFs()
    const destructiveCmd: AssetMeta = {
      ...cmd,
      id: 'wipe',
      name: 'wipe',
      requires: ['vault_read', 'vault_delete'], // one safe, one destructive
    }
    const result = await enableAsset(fs, destructiveCmd, [destructiveCmd], ['claude'])
    expect(result.destructive).toEqual(['wipe → vault_delete'])
    // R5: allowed-tools is in the command's OWN frontmatter (what Claude reads),
    // granting only the safe tool (canonical prefix); the destructive tool is denied.
    const written = (await fs.read('.claude/commands/wipe.md'))!
    const fm = parseYaml(written.slice(4, written.indexOf('\n---\n'))) as Record<string, unknown>
    expect(fm['allowed-tools']).toBe('mcp__specorator-obsidian-mcp__vault_read')
  })
})
