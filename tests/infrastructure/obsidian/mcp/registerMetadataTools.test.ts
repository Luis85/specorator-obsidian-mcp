import { describe, it, expect } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerMetadataTools } from '@/infrastructure/obsidian/mcp/registerMetadataTools'
import { fakeModulePorts } from '@@/__fakes__/fake-ports'
import { DEFAULT_TOOL_MODES } from '@/domain/settings/PluginSettings'
import { getHandler, getRegisteredTools } from '@@/__fakes__/gate-helpers'

function setup() {
  const ports = fakeModulePorts()
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  registerMetadataTools(server, { metadata: ports.metadataCache, vault: ports.vault })
  return { server, ports }
}

describe('registerMetadataTools', () => {
  it('registers exactly the canonical metadata tools (per DEFAULT_TOOL_MODES)', () => {
    const { server } = setup()
    const tools = getRegisteredTools(server)
    const expected = Object.keys(DEFAULT_TOOL_MODES)
      .filter((k) => k.startsWith('metadata.'))
      .sort()
    expect(Object.keys(tools).sort()).toEqual(expected)
  })

  it('metadata.frontmatter returns frontmatter from metadata cache snapshot', async () => {
    const { server, ports } = setup()
    ports.bridge.seedMetadata('note.md', {
      path: 'note.md',
      tags: [],
      frontmatter: { title: 'Hello' },
      links: [],
      embeds: [],
    })
    const result = (await getHandler(server, 'metadata.frontmatter')({ path: 'note.md' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as { frontmatter: Record<string, unknown> }
    expect(parsed.frontmatter).toEqual({ title: 'Hello' })
  })

  it('metadata.frontmatter falls back to raw file parse when snapshot absent', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('fallback.md', '---\nauthor: Bob\n---\nbody')
    const result = (await getHandler(
      server,
      'metadata.frontmatter',
    )({
      path: 'fallback.md',
    })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as { frontmatter: Record<string, unknown> }
    expect(parsed.frontmatter).toEqual({ author: 'Bob' })
  })

  it('metadata.tags returns global tag map', async () => {
    const { server, ports } = setup()
    ports.bridge.seedTags({ '#todo': 3, '#done': 1 })
    const result = (await getHandler(server, 'metadata.tags')({})) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as { tags: Record<string, number> }
    expect(parsed.tags).toEqual({ '#todo': 3, '#done': 1 })
  })

  it('metadata.headings returns empty array when no headings in snapshot', async () => {
    const { server, ports } = setup()
    ports.bridge.seedMetadata('hd.md', {
      path: 'hd.md',
      tags: [],
      frontmatter: {},
      links: [],
      embeds: [],
    })
    const result = (await getHandler(server, 'metadata.headings')({ path: 'hd.md' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as { headings: unknown[] }
    expect(parsed.headings).toEqual([])
  })

  it('metadata.headings returns seeded headings with correct shape', async () => {
    const { server, ports } = setup()
    ports.bridge.seedHeadings('doc.md', [
      { heading: 'Introduction', level: 1 },
      { heading: 'Overview', level: 2 },
    ])
    const result = (await getHandler(server, 'metadata.headings')({ path: 'doc.md' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as {
      headings: Array<{ heading: string; level: number }>
    }
    expect(parsed.headings).toHaveLength(2)
    expect(parsed.headings[0]).toEqual({ heading: 'Introduction', level: 1 })
    expect(parsed.headings[1]).toEqual({ heading: 'Overview', level: 2 })
  })

  it('metadata.headings returns empty array when snapshot absent', async () => {
    const { server } = setup()
    const result = (await getHandler(server, 'metadata.headings')({ path: 'absent.md' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as { headings: unknown[] }
    expect(parsed.headings).toEqual([])
  })

  it('metadata.linkpath resolves known linktext', async () => {
    const { server, ports } = setup()
    ports.bridge.seedLinkpathDest('Page', 'src.md', 'folder/Page.md')
    const result = (await getHandler(
      server,
      'metadata.linkpath',
    )({
      linktext: 'Page',
      sourcePath: 'src.md',
    })) as { content: [{ text: string }] }
    const parsed = JSON.parse(result.content[0].text) as { resolved: string | null }
    expect(parsed.resolved).toBe('folder/Page.md')
  })

  it('metadata.linkpath returns null for unresolved linktext', async () => {
    const { server } = setup()
    const result = (await getHandler(
      server,
      'metadata.linkpath',
    )({
      linktext: 'Unknown',
      sourcePath: 'src.md',
    })) as { content: [{ text: string }] }
    const parsed = JSON.parse(result.content[0].text) as { resolved: string | null }
    expect(parsed.resolved).toBeNull()
  })

  describe('metadata.search', () => {
    it('finds files by tag', async () => {
      const { server, ports } = setup()
      ports.bridge.seedMetadata('tagged.md', {
        path: 'tagged.md',
        tags: ['#todo'],
        frontmatter: {},
        links: [],
        embeds: [],
      })
      ports.bridge.seedMetadata('other.md', {
        path: 'other.md',
        tags: ['#done'],
        frontmatter: {},
        links: [],
        embeds: [],
      })
      const result = (await getHandler(server, 'metadata.search')({ tag: '#todo' })) as {
        content: [{ text: string }]
      }
      const parsed = JSON.parse(result.content[0].text) as { paths: string[] }
      expect(parsed.paths).toContain('tagged.md')
      expect(parsed.paths).not.toContain('other.md')
    })

    it('finds files by frontmatter field+value', async () => {
      const { server, ports } = setup()
      ports.bridge.seedMetadata('active.md', {
        path: 'active.md',
        tags: [],
        frontmatter: { status: 'active' },
        links: [],
        embeds: [],
      })
      ports.bridge.seedMetadata('archived.md', {
        path: 'archived.md',
        tags: [],
        frontmatter: { status: 'archived' },
        links: [],
        embeds: [],
      })
      const result = (await getHandler(server, 'metadata.search')({
        field: 'status',
        value: 'active',
      })) as { content: [{ text: string }] }
      const parsed = JSON.parse(result.content[0].text) as { paths: string[] }
      expect(parsed.paths).toContain('active.md')
      expect(parsed.paths).not.toContain('archived.md')
    })

    it('returns error when both tag and field are provided', async () => {
      const { server } = setup()
      const res = (await getHandler(server, 'metadata.search')({
        tag: '#todo',
        field: 'status',
        value: 'active',
      })) as { isError: boolean }
      expect(res.isError).toBe(true)
    })

    it('returns error when neither tag nor field is provided', async () => {
      const { server } = setup()
      const res = (await getHandler(server, 'metadata.search')({})) as { isError: boolean }
      expect(res.isError).toBe(true)
    })
  })
})
