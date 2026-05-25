import { describe, it, expect } from 'vitest'
import { parseAsset } from '@/application/catalog/frontmatter'

const good = `---
name: auditing-vault
description: Audits an Obsidian vault. Use when the user asks to health-check a vault.
type: skill
version: 0.1.0
bundle: Vault Audit
requires: [links_backlinks, metadata_tags]
dependsOn: []
---
# Body
Do the audit.`

describe('parseAsset', () => {
  it('parses valid frontmatter into AssetMeta', () => {
    const a = parseAsset('auditing-vault', good)
    expect(a.id).toBe('auditing-vault')
    expect(a.type).toBe('skill')
    expect(a.requires).toEqual(['links_backlinks', 'metadata_tags'])
    expect(a.body.trim().startsWith('# Body')).toBe(true)
  })

  it('rejects a name that is not lowercase-hyphen', () => {
    const bad = good.replace('auditing-vault', 'Auditing Vault')
    expect(() => parseAsset('auditing-vault', bad)).toThrow(/lowercase/i)
  })

  it('rejects when id does not match frontmatter name', () => {
    expect(() => parseAsset('other-id', good)).toThrow(/match/i)
  })

  it('rejects missing description', () => {
    const bad = good.replace(/description:.*\n/, '')
    expect(() => parseAsset('auditing-vault', bad)).toThrow(/description/i)
  })

  it('rejects a description longer than 1024 chars', () => {
    const long = 'Use when ' + 'x'.repeat(1100)
    const bad = good.replace(/description:.*\n/, `description: ${long}\n`)
    expect(() => parseAsset('auditing-vault', bad)).toThrow(/1024/)
  })

  it("rejects a description with no 'use when'/trigger phrase", () => {
    const bad = good.replace(/description:.*\n/, 'description: Audits an Obsidian vault.\n')
    expect(() => parseAsset('auditing-vault', bad)).toThrow(/use when|trigger/i)
  })

  it('rejects a skill name that is not a gerund (-ing)', () => {
    const bad = good.replace('auditing-vault', 'audit-vault')
    expect(() => parseAsset('audit-vault', bad)).toThrow(/gerund|-ing/i)
  })

  it('accepts a multi-word gerund skill name', () => {
    const a = parseAsset('auditing-vault', good)
    expect(a.name).toBe('auditing-vault')
  })

  it('tolerates CRLF line endings in the frontmatter delimiters', () => {
    const crlf = good.replace(/\n/g, '\r\n')
    const a = parseAsset('auditing-vault', crlf)
    expect(a.name).toBe('auditing-vault')
  })
})
