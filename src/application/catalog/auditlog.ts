import type { FileSystem } from '@/domain/catalog/types'

export const AUDIT_PATH = '.specorator/audit-log.jsonl'

/** Maximum audit log size in bytes before rotation is triggered (5 MB). */
const MAX_AUDIT_BYTES = 5_000_000

export interface InstallAuditEntry {
  kind: 'install'
  action: 'enable' | 'disable' | 'update'
  id: string
  hash: string
  ts?: string
}

export interface ToolCallAuditEntry {
  kind: 'tool-call'
  tool: string
  decision: 'allow' | 'deny'
  reason: string
  params?: Record<string, unknown>
  ts?: string
}

export type AuditEntry = InstallAuditEntry | ToolCallAuditEntry

/**
 * Redact large or sensitive param fields before writing to the audit log.
 * Drops fields named content/body/data and truncates any string value > 200 chars.
 */
export function redactParams(params: Record<string, unknown>): Record<string, unknown> {
  const LARGE_FIELD_RE = /^(content|body|data)$/
  const MAX_LEN = 200
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params)) {
    if (LARGE_FIELD_RE.test(k)) continue
    if (typeof v === 'string' && v.length > MAX_LEN) {
      out[k] = v.slice(0, MAX_LEN) + '…'
    } else {
      out[k] = v
    }
  }
  return out
}

/**
 * Rotate the audit log if it exceeds maxBytes.
 * Drops the oldest 20% of lines and appends a synthetic rotation entry.
 * No-op when the file is absent or below the threshold.
 */
export async function rotateIfNeeded(
  fs: FileSystem,
  path: string,
  maxBytes: number = MAX_AUDIT_BYTES,
): Promise<void> {
  const content = await fs.read(path)
  if (content === null) return
  if (content.length <= maxBytes) return

  const lines = content.split('\n').filter((l) => l.length > 0)
  const dropCount = Math.ceil(lines.length * 0.2)
  const kept = lines.slice(dropCount)
  const rotationEntry =
    JSON.stringify({ kind: 'rotation', removed: dropCount, ts: new Date().toISOString() }) + '\n'
  await fs.write(path, kept.join('\n') + '\n' + rotationEntry)
}

export async function appendAudit(fs: FileSystem, entry: AuditEntry): Promise<void> {
  await fs.mkdirp('.specorator')
  await rotateIfNeeded(fs, AUDIT_PATH)
  const line = JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n'
  // WS-Z2 Fix 5: use fs.append (OS-level append) instead of read-modify-write
  // so concurrent calls cannot lose entries.
  await fs.append(AUDIT_PATH, line)
}
