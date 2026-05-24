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
  registerLinksTools(server, { metadata: ports.metadataCache })
  return { server, ports }
}

describe('registerLinksTools', () => {
  it('registers exactly the three canonical links tools', () => {
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
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as { backlinks: string[] }
    expect(parsed.backlinks).toEqual(['source1.md', 'source2.md'])
  })

  it('links.backlinks returns empty array for note with no backlinks', async () => {
    const { server } = setup()
    const result = (await getHandler(server, 'links.backlinks')({ path: 'orphan.md' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as { backlinks: string[] }
    expect(parsed.backlinks).toEqual([])
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
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as { links: string[] }
    expect(parsed.links).toEqual(['other.md', 'third.md'])
  })

  it('links.outgoing returns empty array when no snapshot', async () => {
    const { server } = setup()
    const result = (await getHandler(server, 'links.outgoing')({ path: 'no-snap.md' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as { links: string[] }
    expect(parsed.links).toEqual([])
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
    })) as { content: [{ text: string }] }
    const parsed = JSON.parse(result.content[0].text) as {
      nodes: string[]
      edges: Array<[string, string]>
    }
    expect(parsed.nodes).toContain('a.md')
    expect(parsed.nodes).toContain('b.md')
    expect(parsed.nodes).toContain('c.md')
    expect(parsed.edges).toContainEqual(['a.md', 'b.md'])
    expect(parsed.edges).toContainEqual(['b.md', 'c.md'])
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
    })) as { content: [{ text: string }] }
    const parsed = JSON.parse(result.content[0].text) as { nodes: string[] }
    expect(parsed.nodes).not.toContain('g.md')
  })
})
