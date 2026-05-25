import { ok, err, type Result } from './Result'
import { UnsafeVaultPathError } from './UnsafeVaultPathError'

const WINDOWS_DRIVE_PREFIX = /^[A-Za-z]:[\\/]/
const RESERVED_ROOTS = new Set(['.obsidian'])

/**
 * Returns true when `path` is any of the equivalent vault-root forms:
 * `''`, `.`, `/`, `./` (after trimming whitespace).
 *
 * All of these map to `ok('')` in `normalizeVaultPath` — i.e. the vault
 * root.  Callers that need to distinguish "root" from "not root" should use
 * this helper rather than comparing against a single literal.
 */
export function isVaultRoot(path: string): boolean {
  const t = path.trim()
  return t === '' || t === '.' || t === '/' || t === './'
}

function rejectAbsolute(original: string, trimmed: string): UnsafeVaultPathError | null {
  if (WINDOWS_DRIVE_PREFIX.test(trimmed)) {
    return new UnsafeVaultPathError(original, 'absolute paths are not allowed')
  }
  // A leading slash/backslash is absolute.  The bare '/' vault-root form is
  // already handled by isVaultRoot() before this function is ever called, so
  // any remaining leading '/' here is a genuine absolute path (e.g. '/etc/passwd').
  if (trimmed.startsWith('/') || trimmed.startsWith('\\')) {
    return new UnsafeVaultPathError(original, 'absolute paths are not allowed')
  }
  return null
}

function collectSegments(
  original: string,
  trimmed: string,
): Result<string[], UnsafeVaultPathError> {
  const parts = trimmed.replace(/\\/g, '/').split('/')
  const out: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      return err(new UnsafeVaultPathError(original, 'parent traversal is not allowed'))
    }
    out.push(part)
  }
  return ok(out)
}

export function normalizeVaultPath(path: string): Result<string, UnsafeVaultPathError> {
  const original = path
  const trimmed = path.trim()

  // Treat all equivalent vault-root forms as ok('').
  if (isVaultRoot(trimmed)) return ok('')

  const absoluteError = rejectAbsolute(original, trimmed)
  if (absoluteError !== null) return err(absoluteError)

  const segmentsResult = collectSegments(original, trimmed)
  if (!segmentsResult.ok) return segmentsResult
  const normalizedParts = segmentsResult.value

  if (normalizedParts.length === 0) {
    // Shouldn't be reachable after isVaultRoot check, but keep as safety net.
    return err(new UnsafeVaultPathError(original, 'path must not be empty'))
  }
  if (RESERVED_ROOTS.has(normalizedParts[0].toLowerCase())) {
    return err(new UnsafeVaultPathError(original, 'reserved vault roots are not plugin-owned'))
  }

  return ok(normalizedParts.join('/'))
}
