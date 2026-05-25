/**
 * Pure-domain audit helper.
 *
 * All logic runs server-side against the MetadataCachePort + VaultPort — no CLI
 * shelling, no external dependencies. Designed to be tested without an Obsidian
 * runtime.
 */
import type { MetadataCachePort } from '@/domain/ports/MetadataCachePort'
import type { VaultPort } from '@/domain/ports/VaultPort'

function joinPath(parent: string, child: string): string {
  const p = parent.replace(/\/+$/, '')
  return p ? `${p}/${child}` : child
}

async function collectAllFiles(vault: VaultPort, folder: string): Promise<string[]> {
  const [files, subfolders] = await Promise.all([
    vault.listFiles(folder),
    vault.listFolders(folder),
  ])
  const nested = await Promise.all(
    subfolders.map((sub) => collectAllFiles(vault, joinPath(folder, sub))),
  )
  return [...files, ...nested.flat()]
}

export type AuditCheck =
  | 'orphans'
  | 'deadends'
  | 'unresolved_links'
  | 'empty_notes'
  | 'large_files'
  | 'tag_dupes'

export const ALL_CHECKS: readonly AuditCheck[] = [
  'orphans',
  'deadends',
  'unresolved_links',
  'empty_notes',
  'large_files',
  'tag_dupes',
]

export interface UnresolvedLink {
  source: string
  target: string
}

export interface LargeFile {
  path: string
  bytes: number
}

export interface TagDupe {
  canonical: string
  variants: string[]
}

export interface AuditFindings {
  orphans?: string[]
  deadends?: string[]
  unresolved_links?: UnresolvedLink[]
  empty_notes?: string[]
  large_files?: LargeFile[]
  tag_dupes?: TagDupe[]
}

export interface AuditResult {
  folder: string
  totalFiles: number
  checksRun: string[]
  findings: AuditFindings
  counts: Record<string, number>
}

const EMPTY_BODY_THRESHOLD = 50 // chars; below this = "empty" note

export async function auditVault(
  deps: { vault: VaultPort; metadata: MetadataCachePort },
  folder: string,
  checks: readonly AuditCheck[],
  sizeThresholdBytes: number,
): Promise<AuditResult> {
  const { vault, metadata } = deps

  const allFiles = await collectAllFiles(vault, folder)
  // Only audit markdown files
  const mdFiles = allFiles.filter((f) => f.endsWith('.md'))

  const findings: AuditFindings = {}
  const counts: Record<string, number> = {}

  for (const check of checks) {
    switch (check) {
      case 'orphans': {
        const orphans: string[] = []
        for (const path of mdFiles) {
          const backlinks = metadata.getBacklinks(path)
          if (backlinks.length === 0) orphans.push(path)
        }
        findings.orphans = orphans
        counts['orphans'] = orphans.length
        break
      }

      case 'deadends': {
        const deadends: string[] = []
        for (const path of mdFiles) {
          const resolved = metadata.getResolvedLinks(path)
          if (Object.keys(resolved).length === 0) deadends.push(path)
        }
        findings.deadends = deadends
        counts['deadends'] = deadends.length
        break
      }

      case 'unresolved_links': {
        const unresolved: UnresolvedLink[] = []
        for (const path of mdFiles) {
          const snap = metadata.getFileMetadata(path)
          if (!snap) continue
          for (const link of snap.links) {
            const dest = metadata.getFirstLinkpathDest(link, path)
            if (dest === null) {
              unresolved.push({ source: path, target: link })
            }
          }
        }
        findings.unresolved_links = unresolved
        counts['unresolved_links'] = unresolved.length
        break
      }

      case 'empty_notes': {
        const empty: string[] = []
        for (const path of mdFiles) {
          let content: string
          try {
            content = await vault.readFile(path)
          } catch {
            continue
          }
          // Strip frontmatter block
          const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim()
          if (body.length < EMPTY_BODY_THRESHOLD) empty.push(path)
        }
        findings.empty_notes = empty
        counts['empty_notes'] = empty.length
        break
      }

      case 'large_files': {
        const large: LargeFile[] = []
        for (const path of mdFiles) {
          let content: string
          try {
            content = await vault.readFile(path)
          } catch {
            continue
          }
          const bytes = new TextEncoder().encode(content).length
          if (bytes > sizeThresholdBytes) large.push({ path, bytes })
        }
        findings.large_files = large
        counts['large_files'] = large.length
        break
      }

      case 'tag_dupes': {
        // Build a map: lowercase → Set of all exact variants seen
        const tagVariants = new Map<string, Set<string>>()
        for (const path of mdFiles) {
          const snap = metadata.getFileMetadata(path)
          if (!snap) continue
          for (const tag of snap.tags) {
            const lower = tag.toLowerCase()
            if (!tagVariants.has(lower)) tagVariants.set(lower, new Set())
            tagVariants.get(lower)!.add(tag)
          }
        }
        const dupes: TagDupe[] = []
        for (const [lower, variants] of tagVariants) {
          if (variants.size > 1) {
            const sorted = [...variants].sort()
            dupes.push({ canonical: lower, variants: sorted })
          }
        }
        findings.tag_dupes = dupes
        counts['tag_dupes'] = dupes.length
        break
      }
    }
  }

  return {
    folder,
    totalFiles: mdFiles.length,
    checksRun: [...checks],
    findings,
    counts,
  }
}
