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
  const prev = (await fs.read(AUDIT_PATH)) ?? ''
  await fs.write(AUDIT_PATH, prev + line)
}
