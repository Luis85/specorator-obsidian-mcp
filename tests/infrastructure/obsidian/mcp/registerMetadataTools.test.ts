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
  it('registers exactly the four canonical metadata tools', () => {
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
})
