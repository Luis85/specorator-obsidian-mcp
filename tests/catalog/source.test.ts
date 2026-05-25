import { describe, it, expect } from 'vitest'
import { loadBundledCatalog } from '@/application/catalog/source'

const indexJson = JSON.stringify({
  version: '0.1.0',
  assets: [
    {
      id: 'auditing-vault',
      name: 'auditing-vault',
      description: 'd',
      type: 'skill',
      version: '0.1.0',
      bundle: 'Vault Audit',
      requires: [],
      dependsOn: [],
      body: '# Body',
    },
  ],
})

describe('loadBundledCatalog', () => {
  it('parses an index.json string into a CatalogIndex', () => {
    const idx = loadBundledCatalog(indexJson)
    expect(idx.assets[0].id).toBe('auditing-vault')
  })
  it('throws on malformed json', () => {
    expect(() => loadBundledCatalog('{bad')).toThrow(/catalog/i)
  })
})
