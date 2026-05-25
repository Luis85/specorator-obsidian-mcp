import { describe, it, expect } from 'vitest'
import { buildConsentSummary } from '@/plugin/modals/ConsentModal'
import type { AssetMeta } from '@/domain/catalog/types'

const asset: AssetMeta = {
  id: 'auditing-vault',
  name: 'auditing-vault',
  description: 'd',
  type: 'skill',
  version: '0.1.0',
  bundle: 'Vault Audit',
  requires: ['links_backlinks'],
  dependsOn: [],
  body: '# Body',
}

describe('buildConsentSummary', () => {
  it('lists exact paths, required tools, and scan status', () => {
    const s = buildConsentSummary(asset, ['.claude/skills/auditing-vault/SKILL.md'], false)
    expect(s.paths).toEqual(['.claude/skills/auditing-vault/SKILL.md'])
    expect(s.requires).toEqual(['links_backlinks'])
    expect(s.scanFlagged).toBe(false)
  })
})
