import { describe, it, expect } from 'vitest'
import { BundledCatalogSource, RemoteCatalogSource } from '@/application/catalog/source'

const indexJson = JSON.stringify({
  version: '0.1.0',
  assets: [
    {
      id: 'x',
      name: 'x',
      description: 'd',
      type: 'skill',
      version: '0.1.0',
      bundle: 'B',
      requires: [],
      dependsOn: [],
      body: '# B',
    },
  ],
})

describe('BundledCatalogSource', () => {
  it('implements list() and fetch()', async () => {
    const src = new BundledCatalogSource(indexJson)
    const list = await src.list()
    expect(list.assets[0].id).toBe('x')
    const asset = await src.fetch('x')
    expect(asset.body).toContain('# B')
  })
  it('verify() is a no-op (trusted) for bundled assets', async () => {
    const src = new BundledCatalogSource(indexJson)
    expect((await src.verify('x')).ok).toBe(true)
  })
})

describe('RemoteCatalogSource verification', () => {
  const http = async (_url: string) => indexJson
  const allow = new Set(['catalog.specorator.dev'])

  it('REJECTS the stub sentinel when no pin/signature provider is supplied', async () => {
    const src = new RemoteCatalogSource('https://catalog.specorator.dev/index.json', allow, http)
    const r = await src.verify('x')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/stub|signature/i)
  })

  it('passes only with a real (placeholder) signature + matching pinned hash', async () => {
    const pinFor = () => ({
      contentHash: 'abc',
      pinnedHash: 'abc',
      signature: 'placeholder-signature',
    })
    const src = new RemoteCatalogSource(
      'https://catalog.specorator.dev/index.json',
      allow,
      http,
      pinFor,
    )
    const r = await src.verify('x')
    expect(r.ok).toBe(true)
  })
})
