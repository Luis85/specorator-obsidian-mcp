import { describe, it, expect } from 'vitest'
import { checkRequires } from '@/application/catalog/requires'
import type { AssetMeta } from '@/domain/catalog/types'

const partial = (requires: string[]): AssetMeta => ({ requires }) as unknown as AssetMeta

const asset = partial(['links_backlinks', 'audit_report'])

describe('checkRequires', () => {
  it('uses the live tool list when present', () => {
    const r = checkRequires(asset, ['links_backlinks'], ['links_backlinks', 'audit_report'])
    expect(r.available).toBe(false)
    expect(r.missing).toEqual(['audit_report'])
    expect(r.source).toBe('live')
  })
  it('falls back to static when live is null', () => {
    const r = checkRequires(asset, null, ['links_backlinks', 'audit_report'])
    expect(r.available).toBe(true)
    expect(r.source).toBe('static')
  })
  // MCP v0.1.0: a tool present but in `deny` mode is effectively unusable.
  it('treats a present-but-denied tool as effectively unavailable', () => {
    const a = partial(['vault_write'])
    const r = checkRequires(a, ['vault_write'], ['vault_write'], { vault_write: 'deny' })
    expect(r.available).toBe(false)
    expect(r.denied).toEqual(['vault_write'])
  })
  it('surfaces ask-mode tools without marking unavailable', () => {
    const a = partial(['vault_write'])
    const r = checkRequires(a, ['vault_write'], ['vault_write'], { vault_write: 'ask' })
    expect(r.available).toBe(true)
    expect(r.ask).toEqual(['vault_write'])
  })
})
