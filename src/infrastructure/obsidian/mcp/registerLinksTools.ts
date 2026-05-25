import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { MetadataCachePort, VaultPort } from '@/domain/ports'
import { normalizeVaultPath } from '@/domain/shared/VaultPath'
import { ok, err, collectFiles } from './shared'

function unsafePath(msg: string): { isError: true; content: [{ type: 'text'; text: string }] } {
  return err(`unsafe path: ${msg}`)
}

type TraverseDirection = 'outgoing' | 'backlinks' | 'both'

function neighborsOf(
  metadataCache: MetadataCachePort,
  node: string,
  direction: TraverseDirection,
): { outgoing: readonly string[]; incoming: readonly string[] } {
  const outgoing =
    direction === 'outgoing' || direction === 'both'
      ? Object.keys(metadataCache.getResolvedLinks(node))
      : []
  const incoming =
    direction === 'backlinks' || direction === 'both' ? metadataCache.getBacklinks(node) : []
  return { outgoing, incoming }
}

function bfsTraverse(
  metadataCache: MetadataCachePort,
  startPath: string,
  cappedDepth: number,
  direction: TraverseDirection,
): { nodes: string[]; edges: Array<[string, string]> } {
  const visited = new Set<string>([startPath])
  const edges: Array<[string, string]> = []
  // Keyed by "from|to" — directed dedup: A→B and B→A are distinct edges.
  const seenEdges = new Set<string>()
  let frontier: string[] = [startPath]
  for (let hop = 0; hop < cappedDepth; hop++) {
    const next: string[] = []
    for (const node of frontier) {
      const { outgoing, incoming } = neighborsOf(metadataCache, node, direction)
      for (const target of outgoing) {
        const key = `${node}|${target}`
        if (!seenEdges.has(key)) {
          seenEdges.add(key)
          edges.push([node, target])
        }
        if (!visited.has(target)) {
          visited.add(target)
          next.push(target)
        }
      }
      for (const source of incoming) {
        const key = `${source}|${node}`
        if (!seenEdges.has(key)) {
          seenEdges.add(key)
          edges.push([source, node])
        }
        if (!visited.has(source)) {
          visited.add(source)
          next.push(source)
        }
      }
    }
    frontier = next
    if (frontier.length === 0) break
  }
  return { nodes: Array.from(visited), edges }
}

export function registerLinksTools(
  server: McpServer,
  deps: { metadata: MetadataCachePort; vault: VaultPort },
): void {
  const { metadata, vault } = deps

  server.registerTool(
    'links.backlinks',
    {
      description: 'Get vault paths that link to the given note',
      inputSchema: { path: z.string().describe('Vault-relative path') },
    },
    async ({ path }) => {
      const norm = normalizeVaultPath(path)
      if (!norm.ok) return unsafePath(norm.error.message)
      return ok({ backlinks: metadata.getBacklinks(norm.value) })
    },
  )

  server.registerTool(
    'links.outgoing',
    {
      description: 'Get outgoing wikilinks from a note (resolved link targets)',
      inputSchema: { path: z.string().describe('Vault-relative path') },
    },
    async ({ path }) => {
      const norm = normalizeVaultPath(path)
      if (!norm.ok) return unsafePath(norm.error.message)
      const snapshot = metadata.getFileMetadata(norm.value)
      return ok({ links: snapshot?.links ?? [] })
    },
  )

  server.registerTool(
    'links.bfs',
    {
      description:
        'Breadth-first traversal of the link graph. Depth capped at 5 regardless of input. Returns { nodes: string[], edges: [string, string][] }.',
      inputSchema: {
        startPath: z.string().describe('Starting vault path'),
        depth: z.number().int().min(1).max(5).describe('Hop limit (max 5)'),
        direction: z.enum(['outgoing', 'backlinks', 'both']),
      },
    },
    async ({ startPath, depth, direction }) => {
      const norm = normalizeVaultPath(startPath)
      if (!norm.ok) return unsafePath(norm.error.message)
      const result = bfsTraverse(metadata, norm.value, Math.min(depth, 5), direction)
      return ok(result)
    },
  )

  server.registerTool(
    'links.unresolved',
    {
      description:
        'Find all dangling wikilinks across the vault (or a folder). A dangling link is a [[Target]] whose target note does not exist. Returns { unresolved: Array<{ source, target }>, count }.',
      inputSchema: {
        folder: z
          .string()
          .optional()
          .describe('Vault-relative folder to scan (default: vault root).'),
      },
    },
    async ({ folder = '' }) => {
      const norm = normalizeVaultPath(folder)
      if (!norm.ok) return unsafePath(norm.error.message)

      const allFiles = await collectFiles(vault, norm.value)
      const mdFiles = allFiles.filter((f) => f.endsWith('.md'))

      const unresolved: Array<{ source: string; target: string }> = []
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

      return ok({ unresolved, count: unresolved.length })
    },
  )
}
