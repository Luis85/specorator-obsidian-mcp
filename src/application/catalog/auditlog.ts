import type { FileSystem } from '@/domain/catalog/types'

export const AUDIT_PATH = '.specorator/audit-log.jsonl'

export interface AuditEntry {
  action: 'enable' | 'disable' | 'update'
  id: string
  hash: string
  ts?: string
}

export async function appendAudit(fs: FileSystem, entry: AuditEntry): Promise<void> {
  await fs.mkdirp('.specorator')
  const line = JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n'
  // WS-Z2 Fix 5: use fs.append (OS-level append) instead of read-modify-write
  // so concurrent calls cannot lose entries.
  await fs.append(AUDIT_PATH, line)
}
