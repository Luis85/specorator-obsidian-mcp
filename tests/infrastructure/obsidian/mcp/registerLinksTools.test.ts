import { describe, it, expect } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerLinksTools } from '@/infrastructure/obsidian/mcp/registerLinksTools'
import { fakeModulePorts } from '@@/__fakes__/fake-ports'
import { DEFAULT_TOOL_MODES } from '@/domain/settings/PluginSettings'

type RegisteredTool = {
  handler: (args: Record<string, unknown>) => Promise<unknown>
}
type ServerInternal = {
  _registeredTools: Record<string, RegisteredTool>
}

function setup() {
  const ports = fakeModulePorts()
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  registerLinksTools(server, { metadata: ports.metadataCache })
  const tools = (server as unknown as ServerInternal)._registeredTools
  return { server, ports, tools }
}

describe('registerLinksTools', () => {
  it('registers exactly the three canonical links tools', () => {
    const { server } = setup()
    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools
    const expected = Object.keys(DEFAULT_TOOL_MODES).filter((k) => k.startsWith('links.')).sort()
    expect(Object.keys(tools).sort()).toEqual(expected)
  })

  it('links.backlinks returns backlinks for a note', async () => {
    const { tools, ports } = setup()
    ports.bridge.seedBacklinks('target.md', ['source1.md', 'source2.md'])
    const result = (await tools['links.backlinks'].handler({ path: 'target.md' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as { backlinks: string[] }
    expect(parsed.backlinks).toEqual(['source1.md', 'source2.md'])
  })

  it('links.backlinks returns empty array for note with no backlinks', async () => {
    const { tools } = setup()
    const result = (await tools['links.backlinks'].handler({ path: 'orphan.md' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as { backlinks: string[] }
    expect(parsed.backlinks).toEqual([])
  })

  it('links.outgoing returns outgoing links from snapshot', async () => {
    const { tools, ports } = setup()
    ports.bridge.seedMetadata('note.md', {
      path: 'note.md',
      tags: [],
      frontmatter: {},
      links: ['other.md', 'third.md'],
      embeds: [],
    })
    const result = (await tools['links.outgoing'].handler({ path: 'note.md' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as { links: string[] }
    expect(parsed.links).toEqual(['other.md', 'third.md'])
  })

  it('links.outgoing returns empty array when no snapshot', async () => {
    const { tools } = setup()
    const result = (await tools['links.outgoing'].handler({ path: 'no-snap.md' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as { links: string[] }
    expect(parsed.links).toEqual([])
  })

  it('links.bfs traverses outgoing edges', async () => {
    const { tools, ports } = setup()
    ports.bridge.seedResolvedLinks('a.md', { 'b.md': 1 })
    ports.bridge.seedResolvedLinks('b.md', { 'c.md': 1 })
    const result = (await tools['links.bfs'].handler({
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

  it('links.bfs caps depth at 5', async () => {
    const { tools, ports } = setup()
    // chain: a→b→c→d→e→f→g (7 hops deep)
    const chain = ['a.md', 'b.md', 'c.md', 'd.md', 'e.md', 'f.md', 'g.md']
    for (let i = 0; i < chain.length - 1; i++) {
      ports.bridge.seedResolvedLinks(chain[i], { [chain[i + 1]]: 1 })
    }
    const result = (await tools['links.bfs'].handler({
      startPath: 'a.md',
      depth: 10, // user requests 10, should be capped at 5
      direction: 'outgoing',
    })) as { content: [{ text: string }] }
    const parsed = JSON.parse(result.content[0].text) as { nodes: string[] }
    // With depth capped at 5 from 'a.md': a,b,c,d,e,f — f is hop 5 (index 5)
    expect(parsed.nodes).not.toContain('g.md')
  })
})
