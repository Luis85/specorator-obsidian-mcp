/**
 * Pure-domain graph analysis helpers.
 *
 * All logic runs server-side against MetadataCachePort + VaultPort — no CLI
 * shelling, no external dependencies. Designed to be tested without an
 * Obsidian runtime.
 */
import type { MetadataCachePort } from '@/domain/ports/MetadataCachePort'
import type { VaultPort } from '@/domain/ports/VaultPort'

// ── shared file collector ────────────────────────────────────────────────────

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

// ── Union-Find for connected components ─────────────────────────────────────

function makeUnionFind(nodes: string[]): {
  union(a: string, b: string): void
  find(a: string): string
  componentCount(): number
} {
  const parent = new Map<string, string>()
  for (const n of nodes) parent.set(n, n)

  function find(x: string): string {
    let root = x
    while (parent.get(root) !== root) root = parent.get(root)!
    // Path compression
    let cur = x
    while (cur !== root) {
      const next = parent.get(cur)!
      parent.set(cur, root)
      cur = next
    }
    return root
  }

  function union(a: string, b: string): void {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  function componentCount(): number {
    let count = 0
    for (const [n] of parent) {
      if (find(n) === n) count++
    }
    return count
  }

  return { union, find, componentCount }
}

// ── public graph stats helper ────────────────────────────────────────────────

export interface GraphStats {
  totalNotes: number
  totalLinks: number
  components: number
  orphans: number
  deadends: number
  hubs: Array<{ path: string; inDegree: number }>
  orphanPercent: number
}

export async function computeGraphStats(
  deps: { vault: VaultPort; metadata: MetadataCachePort },
  folder: string,
): Promise<GraphStats> {
  const { vault, metadata } = deps

  const allFiles = await collectAllFiles(vault, folder)
  const mdFiles = allFiles.filter((f) => f.endsWith('.md'))

  if (mdFiles.length === 0) {
    return {
      totalNotes: 0,
      totalLinks: 0,
      components: 0,
      orphans: 0,
      deadends: 0,
      hubs: [],
      orphanPercent: 0,
    }
  }

  // Build in-degree map and directed edge set
  const inDegree = new Map<string, number>()
  for (const f of mdFiles) inDegree.set(f, 0)

  let totalLinks = 0
  const uf = makeUnionFind(mdFiles)
  const mdSet = new Set(mdFiles)

  for (const path of mdFiles) {
    const resolved = metadata.getResolvedLinks(path)
    for (const [target, count] of Object.entries(resolved)) {
      totalLinks += count
      if (mdSet.has(target)) {
        inDegree.set(target, (inDegree.get(target) ?? 0) + count)
        uf.union(path, target)
      }
    }
  }

  // Orphans: zero in-degree
  let orphanCount = 0
  for (const [, deg] of inDegree) {
    if (deg === 0) orphanCount++
  }

  // Deadends: zero out-degree
  let deadendCount = 0
  for (const path of mdFiles) {
    const resolved = metadata.getResolvedLinks(path)
    const outgoing = Object.keys(resolved).filter((t) => mdSet.has(t))
    if (outgoing.length === 0) deadendCount++
  }

  // Hubs: top 10 by in-degree
  const sorted = [...inDegree.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, inDegree]) => ({ path, inDegree }))

  const orphanPercent =
    mdFiles.length > 0 ? Math.round((orphanCount / mdFiles.length) * 10000) / 100 : 0

  return {
    totalNotes: mdFiles.length,
    totalLinks,
    components: uf.componentCount(),
    orphans: orphanCount,
    deadends: deadendCount,
    hubs: sorted,
    orphanPercent,
  }
}

// ── orphan list helper ───────────────────────────────────────────────────────

export interface OrphanEntry {
  path: string
  lastModified: string // ISO date
  bytes: number
}

export interface OrphanResult {
  orphans: OrphanEntry[]
  count: number
}

export async function findOrphans(
  deps: { vault: VaultPort; metadata: MetadataCachePort },
  folder: string,
  staleDays?: number,
): Promise<OrphanResult> {
  const { vault, metadata } = deps

  const allFiles = await collectAllFiles(vault, folder)
  const mdFiles = allFiles.filter((f) => f.endsWith('.md'))

  const now = Date.now()
  const staleCutoff = staleDays !== undefined ? now - staleDays * 86_400_000 : null

  const orphans: OrphanEntry[] = []
  for (const path of mdFiles) {
    const backlinks = metadata.getBacklinks(path)
    if (backlinks.length > 0) continue

    const stats = await vault.getFileStats(path)
    const mtime = stats?.mtime ?? 0
    const bytes = stats?.size ?? 0

    // Apply stale filter if requested
    if (staleCutoff !== null && mtime > staleCutoff) continue

    const lastModified = new Date(mtime).toISOString()
    orphans.push({ path, lastModified, bytes })
  }

  return { orphans, count: orphans.length }
}

// ── deadend list helper ──────────────────────────────────────────────────────

export interface DeadendResult {
  deadends: string[]
  count: number
}

export async function findDeadends(
  deps: { vault: VaultPort; metadata: MetadataCachePort },
  folder: string,
): Promise<DeadendResult> {
  const { vault, metadata } = deps

  const allFiles = await collectAllFiles(vault, folder)
  const mdFiles = allFiles.filter((f) => f.endsWith('.md'))
  const mdSet = new Set(mdFiles)

  const deadends: string[] = []
  for (const path of mdFiles) {
    const resolved = metadata.getResolvedLinks(path)
    const outgoing = Object.keys(resolved).filter((t) => mdSet.has(t))
    if (outgoing.length === 0) deadends.push(path)
  }

  return { deadends, count: deadends.length }
}
