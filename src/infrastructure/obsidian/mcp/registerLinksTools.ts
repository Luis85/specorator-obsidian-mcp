import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { MetadataCachePort } from '@/domain/ports'
import { ok } from './shared'

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
  let frontier: string[] = [startPath]
  for (let hop = 0; hop < cappedDepth; hop++) {
    const next: string[] = []
    for (const node of frontier) {
      const { outgoing, incoming } = neighborsOf(metadataCache, node, direction)
      for (const target of outgoing) {
        edges.push([node, target])
        if (!visited.has(target)) {
          visited.add(target)
          next.push(target)
        }
      }
      for (const source of incoming) {
        edges.push([source, node])
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
  deps: { metadata: MetadataCachePort },
): void {
  const { metadata } = deps

  server.registerTool(
    'links.backlinks',
    {
      description: 'Get vault paths that link to the given note',
      inputSchema: { path: z.string().describe('Vault-relative path') },
    },
    async ({ path }) => ok({ backlinks: metadata.getBacklinks(path) }),
  )

  server.registerTool(
    'links.outgoing',
    {
      description: 'Get outgoing wikilinks from a note (resolved link targets)',
      inputSchema: { path: z.string().describe('Vault-relative path') },
    },
    async ({ path }) => {
      const snapshot = metadata.getFileMetadata(path)
      return ok({ links: snapshot?.links ?? [] })
    },
  )

  server.registerTool(
    'links.bfs',
    {
      description:
        'BFS traverse the link graph from a start node. Direction = outgoing | backlinks | both. Depth capped at 5.',
      inputSchema: {
        startPath: z.string().describe('Starting vault path'),
        depth: z.number().int().min(1).describe('Hop limit (capped at 5)'),
        direction: z.enum(['outgoing', 'backlinks', 'both']),
      },
    },
    async ({ startPath, depth, direction }) => {
      const result = bfsTraverse(metadata, startPath, Math.min(depth, 5), direction)
      return ok(result)
    },
  )
}
