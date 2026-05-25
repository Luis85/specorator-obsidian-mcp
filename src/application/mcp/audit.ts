/**
 * Pure-domain audit helper.
 *
 * All logic runs server-side against the MetadataCachePort + VaultPort — no CLI
 * shelling, no external dependencies. Designed to be tested without an Obsidian
 * runtime.
 */
import type { MetadataCachePort } from '@/domain/ports/MetadataCachePort'
import type { VaultPort } from '@/domain/ports/VaultPort'
import { pool, yieldEveryN } from '@/application/mcp/batching'

function joinPath(parent: string, child: string): string {
  const p = parent.replace(/\/+$/, '')
  return p ? `${p}/${child}` : child
}

async function collectAllFiles(vault: VaultPort, folder: string): Promise<string[]> {
  const [files, subfolders] = await Promise.all([
    vault.listFiles(folder),
    vault.listFolders(folder),
  ])
  // Cap concurrency at 8 to prevent unbounded recursive fan-out on large vaults.
  const nested = await pool(subfolders, 8, (sub) => collectAllFiles(vault, joinPath(folder, sub)))
  return [...files, ...nested.flat()]
}

/** Default upper bound on files scanned in a single audit.report call. */
export const DEFAULT_MAX_FILES = 5000

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
  /** True when the vault exceeded maxFiles and results are partial. */
  truncated?: boolean
}

const EMPTY_BODY_THRESHOLD = 50 // chars; below this = "empty" note

export async function auditVault(
  deps: { vault: VaultPort; metadata: MetadataCachePort },
  folder: string,
  checks: readonly AuditCheck[],
  sizeThresholdBytes: number,
  maxFiles: number = DEFAULT_MAX_FILES,
): Promise<AuditResult> {
  const { vault, metadata } = deps

  const allFiles = await collectAllFiles(vault, folder)
  // Only audit markdown files
  let mdFiles = allFiles.filter((f) => f.endsWith('.md'))

  // Soft budget: if the vault is very large, cap the scan and report truncation.
  // Better to return partial results quickly than to freeze the UI indefinitely.
  let truncated = false
  if (mdFiles.length > maxFiles) {
    mdFiles = mdFiles.slice(0, maxFiles)
    truncated = true
  }

  const findings: AuditFindings = {}
  const counts: Record<string, number> = {}

  for (const check of checks) {
    switch (check) {
      case 'orphans': {
        // Pure metadata-cache reads — yield every 200 items (CPU-bound)
        const orphans: string[] = []
        await yieldEveryN(mdFiles, 200, (path) => {
          const backlinks = metadata.getBacklinks(path)
          if (backlinks.length === 0) orphans.push(path)
        })
        findings.orphans = orphans
        counts['orphans'] = orphans.length
        break
      }

      case 'deadends': {
        // Pure metadata-cache reads — yield every 200 items (CPU-bound)
        const deadends: string[] = []
        await yieldEveryN(mdFiles, 200, (path) => {
          const resolved = metadata.getResolvedLinks(path)
          if (Object.keys(resolved).length === 0) deadends.push(path)
        })
        findings.deadends = deadends
        counts['deadends'] = deadends.length
        break
      }

      case 'unresolved_links': {
        // Pure metadata-cache reads — yield every 200 items (CPU-bound)
        const unresolved: UnresolvedLink[] = []
        await yieldEveryN(mdFiles, 200, (path) => {
          const snap = metadata.getFileMetadata(path)
          if (!snap) return
          for (const link of snap.links) {
            const dest = metadata.getFirstLinkpathDest(link, path)
            if (dest === null) {
              unresolved.push({ source: path, target: link })
            }
          }
        })
        findings.unresolved_links = unresolved
        counts['unresolved_links'] = unresolved.length
        break
      }

      case 'empty_notes': {
        // I/O: vault.readFile per file — yield every 50 items
        const empty: string[] = []
        await yieldEveryN(mdFiles, 50, async (path) => {
          let content: string
          try {
            content = await vault.readFile(path)
          } catch {
            return
          }
          // Strip frontmatter block
          const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim()
          if (body.length < EMPTY_BODY_THRESHOLD) empty.push(path)
        })
        findings.empty_notes = empty
        counts['empty_notes'] = empty.length
        break
      }

      case 'large_files': {
        // I/O: vault.readFile per file — yield every 50 items
        const large: LargeFile[] = []
        await yieldEveryN(mdFiles, 50, async (path) => {
          let content: string
          try {
            content = await vault.readFile(path)
          } catch {
            return
          }
          const bytes = new TextEncoder().encode(content).length
          if (bytes > sizeThresholdBytes) large.push({ path, bytes })
        })
        findings.large_files = large
        counts['large_files'] = large.length
        break
      }

      case 'tag_dupes': {
        // Pure metadata-cache reads — yield every 200 items (CPU-bound)
        const tagVariants = new Map<string, Set<string>>()
        await yieldEveryN(mdFiles, 200, (path) => {
          const snap = metadata.getFileMetadata(path)
          if (!snap) return
          for (const tag of snap.tags) {
            const lower = tag.toLowerCase()
            if (!tagVariants.has(lower)) tagVariants.set(lower, new Set())
            tagVariants.get(lower)!.add(tag)
          }
        })
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
    ...(truncated ? { truncated: true } : {}),
  }
}
