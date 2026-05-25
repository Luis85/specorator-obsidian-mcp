export interface RemoteRef {
  host: string
  contentHash: string
  pinnedHash: string
  signature: string
}

export interface VerifyResult {
  ok: boolean
  reason?: string
}

// The literal "stub" sentinel is rejected so an unconfigured RemoteCatalogSource
// can never trivially "pass" verification.
const STUB = 'stub'

export function verifyRemoteAsset(ref: RemoteRef, allowedHosts: Set<string>): VerifyResult {
  if (!allowedHosts.has(ref.host)) {
    return { ok: false, reason: `host not allowlisted: ${ref.host}` }
  }
  // A real signature field is required (even a placeholder), and never the stub sentinel.
  if (ref.signature === '' || ref.signature === STUB) {
    return {
      ok: false,
      reason: 'missing or stub signature — refusing to trust unsigned remote asset',
    }
  }
  if (ref.contentHash === STUB || ref.pinnedHash === STUB) {
    return { ok: false, reason: 'stub content/pinned hash — not a real pin' }
  }
  if (ref.contentHash !== ref.pinnedHash) {
    return { ok: false, reason: 'content hash mismatch' }
  }
  return { ok: true }
}
