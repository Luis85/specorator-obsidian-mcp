import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerLinksTools } from '@/infrastructure/obsidian/mcp/registerLinksTools'
import { fakeModulePorts } from '@@/__fakes__/fake-ports'
import { DEFAULT_TOOL_MODES } from '@/domain/settings/PluginSettings'
import { getHandler, getRegisteredTools } from '@@/__fakes__/gate-helpers'

const bfsDepthSchema = z.number().int().min(1).max(5)

function setup() {
  const ports = fakeModulePorts()
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  registerLinksTools(server, { metadata: ports.metadataCache, vault: ports.vault })
  return { server, ports }
}

describe('registerLinksTools', () => {
  it('registers exactly the four canonical links tools', () => {
    const { server } = setup()
    const tools = getRegisteredTools(server)
    const expected = Object.keys(DEFAULT_TOOL_MODES)
      .filter((k) => k.startsWith('links.'))
      .sort()
    expect(Object.keys(tools).sort()).toEqual(expected)
  })

  it('links.backlinks returns backlinks for a note', async () => {
    const { server, ports } = setup()
    ports.bridge.seedBacklinks('target.md', ['source1.md', 'source2.md'])
    const result = (await getHandler(server, 'links.backlinks')({ path: 'target.md' })) as {
      structuredContent: { backlinks: string[] }
      content: [{ text: string }]
    }
    expect(result).toHaveProperty('structuredContent')
    expect(result.structuredContent.backlinks).toEqual(['source1.md', 'source2.md'])
  })

  it('links.backlinks returns empty array for note with no backlinks', async () => {
    const { server } = setup()
    const result = (await getHandler(server, 'links.backlinks')({ path: 'orphan.md' })) as {
      structuredContent: { backlinks: string[] }
    }
    expect(result.structuredContent.backlinks).toEqual([])
  })

  it('links.outgoing returns outgoing links from snapshot', async () => {
    const { server, ports } = setup()
    ports.bridge.seedMetadata('note.md', {
      path: 'note.md',
      tags: [],
      frontmatter: {},
      links: ['other.md', 'third.md'],
      embeds: [],
    })
    const result = (await getHandler(server, 'links.outgoing')({ path: 'note.md' })) as {
      structuredContent: { links: string[] }
      content: [{ text: string }]
    }
    expect(result).toHaveProperty('structuredContent')
    expect(result.structuredContent.links).toEqual(['other.md', 'third.md'])
  })

  it('links.outgoing returns empty array when no snapshot', async () => {
    const { server } = setup()
    const result = (await getHandler(server, 'links.outgoing')({ path: 'no-snap.md' })) as {
      structuredContent: { links: string[] }
    }
    expect(result.structuredContent.links).toEqual([])
  })

  it('links.bfs traverses outgoing edges', async () => {
    const { server, ports } = setup()
    ports.bridge.seedResolvedLinks('a.md', { 'b.md': 1 })
    ports.bridge.seedResolvedLinks('b.md', { 'c.md': 1 })
    const result = (await getHandler(
      server,
      'links.bfs',
    )({
      startPath: 'a.md',
      depth: 2,
      direction: 'outgoing',
    })) as {
      structuredContent: { nodes: string[]; edges: Array<[string, string]> }
      content: [{ text: string }]
    }
    expect(result).toHaveProperty('structuredContent')
    expect(result.structuredContent.nodes).toContain('a.md')
    expect(result.structuredContent.nodes).toContain('b.md')
    expect(result.structuredContent.nodes).toContain('c.md')
    expect(result.structuredContent.edges).toContainEqual(['a.md', 'b.md'])
    expect(result.structuredContent.edges).toContainEqual(['b.md', 'c.md'])
  })

  describe('links.bfs depth schema', () => {
    it('rejects depth=6 at schema layer', () => {
      expect(bfsDepthSchema.safeParse(6).success).toBe(false)
    })

    it('accepts depth=5 at schema layer', () => {
      expect(bfsDepthSchema.safeParse(5).success).toBe(true)
    })

    it('rejects depth=0 at schema layer', () => {
      expect(bfsDepthSchema.safeParse(0).success).toBe(false)
    })
  })

  describe('links.bfs — directed edge deduplication', () => {
    it('A→B and B→A both survive (directed edges are distinct)', async () => {
      const { server, ports } = setup()
      // A links to B, B links back to A
      ports.bridge.seedResolvedLinks('a.md', { 'b.md': 1 })
      ports.bridge.seedResolvedLinks('b.md', { 'a.md': 1 })
      const result = (await getHandler(
        server,
        'links.bfs',
      )({
        startPath: 'a.md',
        depth: 2,
        direction: 'outgoing',
      })) as { structuredContent: { edges: Array<[string, string]> } }
      const ab = result.structuredContent.edges.filter(([f, t]) => f === 'a.md' && t === 'b.md')
      const ba = result.structuredContent.edges.filter(([f, t]) => f === 'b.md' && t === 'a.md')
      expect(ab).toHaveLength(1)
      expect(ba).toHaveLength(1)
    })

    it('A→B edge appears exactly once even when reachable via multiple BFS paths', async () => {
      const { server, ports } = setup()
      // Two paths from A to C: A→B→C and A→C directly
      ports.bridge.seedResolvedLinks('a.md', { 'b.md': 1, 'c.md': 1 })
      ports.bridge.seedResolvedLinks('b.md', { 'c.md': 1 })
      const result = (await getHandler(
        server,
        'links.bfs',
      )({
        startPath: 'a.md',
        depth: 3,
        direction: 'outgoing',
      })) as { structuredContent: { edges: Array<[string, string]> } }
      const bc = result.structuredContent.edges.filter(([f, t]) => f === 'b.md' && t === 'c.md')
      const ac = result.structuredContent.edges.filter(([f, t]) => f === 'a.md' && t === 'c.md')
      expect(bc).toHaveLength(1)
      expect(ac).toHaveLength(1)
    })
  })

  it('links.bfs caps depth at 5', async () => {
    const { server, ports } = setup()
    const chain = ['a.md', 'b.md', 'c.md', 'd.md', 'e.md', 'f.md', 'g.md']
    for (let i = 0; i < chain.length - 1; i++) {
      ports.bridge.seedResolvedLinks(chain[i]!, { [chain[i + 1]!]: 1 })
    }
    const result = (await getHandler(
      server,
      'links.bfs',
    )({
      startPath: 'a.md',
      depth: 10,
      direction: 'outgoing',
    })) as { structuredContent: { nodes: string[] } }
    expect(result.structuredContent.nodes).not.toContain('g.md')
  })

  describe('links.unresolved', () => {
    it('returns dangling wikilinks across the vault', async () => {
      const { server, ports } = setup()
      ports.vault.seedFile('note.md', '# Note')
      ports.bridge.seedMetadata('note.md', {
        path: 'note.md',
        tags: [],
        frontmatter: {},
        links: ['Existing', 'Missing'],
        embeds: [],
      })
      ports.bridge.seedLinkpathDest('Existing', 'note.md', 'existing.md')
      // 'Missing' has no seedLinkpathDest → null → unresolved

      const result = (await getHandler(server, 'links.unresolved')({})) as {
        structuredContent: {
          unresolved: Array<{ source: string; target: string }>
          count: number
        }
      }

      expect(result).toHaveProperty('structuredContent')
      expect(result.structuredContent.count).toBe(1)
      expect(result.structuredContent.unresolved[0]).toEqual({
        source: 'note.md',
        target: 'Missing',
      })
    })

    it('returns empty result when all links resolve', async () => {
      const { server, ports } = setup()
      ports.vault.seedFile('clean.md', '# Clean')
      ports.bridge.seedMetadata('clean.md', {
        path: 'clean.md',
        tags: [],
        frontmatter: {},
        links: ['Target'],
        embeds: [],
      })
      ports.bridge.seedLinkpathDest('Target', 'clean.md', 'target.md')

      const result = (await getHandler(server, 'links.unresolved')({})) as {
        structuredContent: { unresolved: unknown[]; count: number }
      }

      expect(result.structuredContent.count).toBe(0)
      expect(result.structuredContent.unresolved).toEqual([])
    })

    it('returns empty result when notes have no outgoing links', async () => {
      const { server, ports } = setup()
      ports.vault.seedFile('isolated.md', '# Isolated')
      ports.bridge.seedMetadata('isolated.md', {
        path: 'isolated.md',
        tags: [],
        frontmatter: {},
        links: [],
        embeds: [],
      })

      const result = (await getHandler(server, 'links.unresolved')({})) as {
        structuredContent: { count: number }
      }

      expect(result.structuredContent.count).toBe(0)
    })

    it('scopes scan to a subfolder', async () => {
      const { server, ports } = setup()
      ports.vault.seedFile('sub/in.md', '# In scope')
      ports.vault.seedFile('out.md', '# Out of scope')
      ports.bridge.seedMetadata('sub/in.md', {
        path: 'sub/in.md',
        tags: [],
        frontmatter: {},
        links: ['Ghost'],
        embeds: [],
      })
      ports.bridge.seedMetadata('out.md', {
        path: 'out.md',
        tags: [],
        frontmatter: {},
        links: ['AlsoGhost'],
        embeds: [],
      })

      const result = (await getHandler(server, 'links.unresolved')({ folder: 'sub' })) as {
        structuredContent: {
          unresolved: Array<{ source: string; target: string }>
          count: number
        }
      }

      // Only the sub/ note is scanned
      expect(result.structuredContent.count).toBe(1)
      expect(result.structuredContent.unresolved[0]!.source).toBe('sub/in.md')
    })

    it('returns error for unsafe folder path', async () => {
      const { server } = setup()

      const result = (await getHandler(server, 'links.unresolved')({ folder: '../evil' })) as {
        isError: boolean
        content: [{ text: string }]
      }

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('unsafe path')
    })
  })
})
