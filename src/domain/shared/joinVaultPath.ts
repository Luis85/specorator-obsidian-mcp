import { type Result } from './Result'
import { type UnsafeVaultPathError } from './UnsafeVaultPathError'
import { normalizeVaultPath } from './normalizeVaultPath'

export function joinVaultPath(...segments: string[]): Result<string, UnsafeVaultPathError> {
  return normalizeVaultPath(segments.join('/'))
}
