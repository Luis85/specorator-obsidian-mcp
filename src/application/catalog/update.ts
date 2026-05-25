import type { AssetMeta, InstalledState, InstalledRecord } from '@/domain/catalog/types'

// Returns ids whose bundled (catalog) version differs from the installed version.
export function detectUpdates(installed: InstalledState, catalog: AssetMeta[]): string[] {
  const out: string[] = []
  const map = installed as Record<string, InstalledRecord | undefined>
  for (const a of catalog) {
    const rec = map[a.id]
    if (rec !== undefined && rec.version !== a.version) out.push(a.id)
  }
  return out
}
