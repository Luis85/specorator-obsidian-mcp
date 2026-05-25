import type { FileSystem } from '@/domain/catalog/types'

/** Timestamped backup path so repeated backups never overwrite each other. */
export function backupPathFor(path: string, ts: string = nowStamp()): string {
  return `${path}.${ts}.bak`
}

function nowStamp(): string {
  // filesystem-safe ISO: 2026-05-25T12-00-00-000Z
  return new Date().toISOString().replace(/[:.]/g, '-')
}

/** Copy current content to a fresh timestamped .bak. Returns the path, or null if absent. */
export async function writeBackup(
  fs: FileSystem,
  path: string,
  ts: string = nowStamp(),
): Promise<string | null> {
  const existing = await fs.read(path)
  if (existing === null) return null
  const dest = backupPathFor(path, ts)
  await fs.write(dest, existing)
  return dest
}
