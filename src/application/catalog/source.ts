import type { AssetMeta, CatalogIndex } from '@/domain/catalog/types'
import { verifyRemoteAsset, type VerifyResult } from './verify'

export function loadBundledCatalog(indexJson: string): CatalogIndex {
  try {
    const idx = JSON.parse(indexJson) as CatalogIndex
    if (!Array.isArray(idx.assets)) throw new Error('no assets[]')
    return idx
  } catch (e) {
    throw new Error(`invalid bundled catalog index: ${(e as Error).message}`, { cause: e })
  }
}

export interface CatalogSource {
  list(): Promise<CatalogIndex>
  fetch(id: string): Promise<AssetMeta>
  verify(id: string): Promise<VerifyResult>
}

export class BundledCatalogSource implements CatalogSource {
  private readonly index: CatalogIndex

  constructor(indexJson: string) {
    this.index = loadBundledCatalog(indexJson)
  }

  list(): Promise<CatalogIndex> {
    return Promise.resolve(this.index)
  }

  fetch(id: string): Promise<AssetMeta> {
    const a = this.index.assets.find((x) => x.id === id)
    if (a === undefined) return Promise.reject(new Error(`asset not found: ${id}`))
    return Promise.resolve(a)
  }

  // Bundled assets are trusted (still scanned at install time by the installer).
  verify(_id: string): Promise<VerifyResult> {
    return Promise.resolve({ ok: true })
  }
}

// Defined for the future; NOT wired into settings in v1.
export class RemoteCatalogSource implements CatalogSource {
  constructor(
    private readonly metaUrl: string,
    private readonly allowedHosts: Set<string>,
    private readonly http: (url: string) => Promise<string>,
    // Optional pin/signature provider (lockfile-backed in a real impl). When
    // absent, verify() falls back to the stub sentinel, which is REJECTED.
    private readonly pinFor?: (
      id: string,
    ) => { contentHash: string; pinnedHash: string; signature: string } | undefined,
  ) {}

  async list(): Promise<CatalogIndex> {
    return loadBundledCatalog(await this.http(this.metaUrl))
  }

  async fetch(id: string): Promise<AssetMeta> {
    const idx = await this.list()
    const a = idx.assets.find((x) => x.id === id)
    if (a === undefined) throw new Error(`asset not found: ${id}`)
    return a
  }

  async verify(id: string): Promise<VerifyResult> {
    const host = new URL(this.metaUrl).host
    const idx = await this.list()
    const a = idx.assets.find((x) => x.id === id)
    if (a === undefined) return { ok: false, reason: `asset not found: ${id}` }
    // In v1 there is no lockfile/signer wired in, so we deliberately pass the
    // stub sentinel — verifyRemoteAsset REJECTS it. A RemoteCatalogSource therefore
    // cannot trivially "pass" verification until a real signer + pinned-hash
    // lockfile is supplied (see "Out of scope").
    const pin = this.pinFor?.(id) ?? {
      contentHash: 'stub',
      pinnedHash: 'stub',
      signature: 'stub',
    }
    return verifyRemoteAsset({ host, ...pin }, this.allowedHosts)
  }
}
