import { describe, it, expect } from 'vitest'
import {
  partitionTools,
  DESTRUCTIVE,
  DEFAULT_PROFILE,
  allowedToolsLine,
  MCP_PREFIX,
} from '@/application/catalog/policy'

describe('policy', () => {
  it('knows the destructive tool set', () => {
    expect(DESTRUCTIVE).toContain('vault_delete')
    expect(DESTRUCTIVE).toContain('cli_execute')
  })

  it('DEFAULT_PROFILE is the read-only allowlist (no destructive members)', () => {
    expect(DEFAULT_PROFILE).toContain('vault_read')
    expect(DEFAULT_PROFILE).toContain('links_backlinks')
    for (const d of DESTRUCTIVE) expect(DEFAULT_PROFILE).not.toContain(d)
  })

  it("partitions an asset's requires into allowed vs needs-consent", () => {
    const { allowed, destructive } = partitionTools([
      'links_backlinks',
      'vault_write',
      'vault_delete',
    ])
    expect(allowed).toEqual(['links_backlinks'])
    expect(destructive).toEqual(['vault_write', 'vault_delete'])
  })

  it('emits a least-privilege allowed-tools line with canonical MCP prefix (B1/B4)', () => {
    // Only the asset's non-destructive requires are granted; each is fully qualified.
    expect(allowedToolsLine(['links_backlinks', 'vault_write'])).toBe(
      'mcp__specorator-obsidian-mcp__links_backlinks',
    )
    expect(MCP_PREFIX).toBe('mcp__specorator-obsidian-mcp__')
  })

  it('default-denies: an asset with only destructive requires grants nothing', () => {
    expect(allowedToolsLine(['vault_delete', 'cli_execute'])).toBe('')
  })
})
