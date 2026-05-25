import { describe, it, expect } from 'vitest'
import { verifyRemoteAsset } from '@/application/catalog/verify'

describe('verifyRemoteAsset', () => {
  const allow = new Set(['catalog.specorator.dev'])
  const sig = 'placeholder-signature' // a real (even if placeholder) signature field
  it('accepts an allowlisted host with a matching pinned hash + a real signature', () => {
    const r = verifyRemoteAsset(
      { host: 'catalog.specorator.dev', contentHash: 'abc', pinnedHash: 'abc', signature: sig },
      allow,
    )
    expect(r.ok).toBe(true)
  })
  it('rejects a non-allowlisted host', () => {
    const r = verifyRemoteAsset(
      { host: 'evil.example', contentHash: 'abc', pinnedHash: 'abc', signature: sig },
      allow,
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/host/i)
  })
  it('rejects a hash mismatch', () => {
    const r = verifyRemoteAsset(
      { host: 'catalog.specorator.dev', contentHash: 'x', pinnedHash: 'abc', signature: sig },
      allow,
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/hash/i)
  })
  it('rejects the literal "stub" sentinel and a missing signature', () => {
    const stubbed = verifyRemoteAsset(
      {
        host: 'catalog.specorator.dev',
        contentHash: 'stub',
        pinnedHash: 'stub',
        signature: 'stub',
      },
      allow,
    )
    expect(stubbed.ok).toBe(false)
    expect(stubbed.reason).toMatch(/stub|unsigned|signature/i)
    const unsigned = verifyRemoteAsset(
      { host: 'catalog.specorator.dev', contentHash: 'abc', pinnedHash: 'abc', signature: '' },
      allow,
    )
    expect(unsigned.ok).toBe(false)
    expect(unsigned.reason).toMatch(/signature/i)
  })
})
