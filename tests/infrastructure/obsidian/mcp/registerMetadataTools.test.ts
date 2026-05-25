import { describe, it, expect } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerMetadataTools } from '@/infrastructure/obsidian/mcp/registerMetadataTools'
import { PermissionGate } from '@/application/mcp/PermissionGate'
import { DEFAULT_SETTINGS, DEFAULT_TOOL_MODES } from '@/domain/settings/PluginSettings'
import { fakeModulePorts } from '@@/__fakes__/fake-ports'
import { getHandler, getRegisteredTools, makeAllowGate } from '@@/__fakes__/gate-helpers'

function setup() {
  const ports = fakeModulePorts()
  const gate = makeAllowGate(ports.confirmModal)
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  registerMetadataTools(server, { metadata: ports.metadataCache, vault: ports.vault, gate })
  return { server, ports, gate }
}

describe('registerMetadataTools', () => {
  it('registers exactly the canonical metadata + frontmatter tools (per DEFAULT_TOOL_MODES)', () => {
    const { server } = setup()
    const tools = getRegisteredTools(server)
    const expected = Object.keys(DEFAULT_TOOL_MODES)
      .filter((k) => k.startsWith('metadata.') || k.startsWith('frontmatter.'))
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

  describe('outputSchema — structuredContent present on all metadata tools', () => {
    it('metadata.tags returns structuredContent with tags record', async () => {
      const { server, ports } = setup()
      ports.bridge.seedTags({ '#note': 2 })
      const result = (await getHandler(server, 'metadata.tags')({})) as {
        structuredContent?: Record<string, unknown>
        content: [{ text: string }]
      }
      expect(result.structuredContent).toBeDefined()
      expect(result.structuredContent!['tags']).toEqual({ '#note': 2 })
    })

    it('metadata.frontmatter returns structuredContent with frontmatter record', async () => {
      const { server, ports } = setup()
      ports.bridge.seedMetadata('sc.md', {
        path: 'sc.md',
        tags: [],
        frontmatter: { key: 'val' },
        links: [],
        embeds: [],
      })
      const result = (await getHandler(server, 'metadata.frontmatter')({ path: 'sc.md' })) as {
        structuredContent?: Record<string, unknown>
        content: [{ text: string }]
      }
      expect(result.structuredContent).toBeDefined()
      expect(result.structuredContent!['frontmatter']).toEqual({ key: 'val' })
    })

    it('metadata.headings returns structuredContent with headings array', async () => {
      const { server } = setup()
      const result = (await getHandler(server, 'metadata.headings')({ path: 'absent.md' })) as {
        structuredContent?: Record<string, unknown>
        content: [{ text: string }]
      }
      expect(result.structuredContent).toBeDefined()
      expect(Array.isArray(result.structuredContent!['headings'])).toBe(true)
    })

    it('metadata.linkpath returns structuredContent with resolved field', async () => {
      const { server } = setup()
      const result = (await getHandler(
        server,
        'metadata.linkpath',
      )({
        linktext: 'X',
        sourcePath: 'src.md',
      })) as {
        structuredContent?: Record<string, unknown>
        content: [{ text: string }]
      }
      expect(result.structuredContent).toBeDefined()
      expect('resolved' in result.structuredContent!).toBe(true)
    })

    it('metadata.search returns structuredContent with paths array', async () => {
      const { server, ports } = setup()
      ports.bridge.seedMetadata('t.md', {
        path: 't.md',
        tags: ['#x'],
        frontmatter: {},
        links: [],
        embeds: [],
      })
      const result = (await getHandler(server, 'metadata.search')({ tag: '#x' })) as {
        structuredContent?: Record<string, unknown>
        content: [{ text: string }]
      }
      expect(result.structuredContent).toBeDefined()
      expect(Array.isArray(result.structuredContent!['paths'])).toBe(true)
    })
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
      const result = (await getHandler(
        server,
        'metadata.search',
      )({
        field: 'status',
        value: 'active',
      })) as { content: [{ text: string }] }
      const parsed = JSON.parse(result.content[0].text) as { paths: string[] }
      expect(parsed.paths).toContain('active.md')
      expect(parsed.paths).not.toContain('archived.md')
    })

    it('returns error when both tag and field are provided', async () => {
      const { server } = setup()
      const res = (await getHandler(
        server,
        'metadata.search',
      )({
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

    it('returns error when both value and contains are provided', async () => {
      const { server } = setup()
      const res = (await getHandler(
        server,
        'metadata.search',
      )({
        field: 'status',
        value: 'active',
        contains: 'act',
      })) as { isError: boolean }
      expect(res.isError).toBe(true)
    })

    it('contains: matches files where string field contains substring', async () => {
      const { server, ports } = setup()
      ports.bridge.seedMetadata('match.md', {
        path: 'match.md',
        tags: [],
        frontmatter: { title: 'Hello World' },
        links: [],
        embeds: [],
      })
      ports.bridge.seedMetadata('no-match.md', {
        path: 'no-match.md',
        tags: [],
        frontmatter: { title: 'Goodbye' },
        links: [],
        embeds: [],
      })
      ports.vault.seedFile('match.md', '')
      ports.vault.seedFile('no-match.md', '')

      const res = (await getHandler(
        server,
        'metadata.search',
      )({
        field: 'title',
        contains: 'Hello',
      })) as { structuredContent: { paths: string[] } }

      expect(res.structuredContent.paths).toContain('match.md')
      expect(res.structuredContent.paths).not.toContain('no-match.md')
    })

    it('contains: matches files where array field contains element', async () => {
      const { server, ports } = setup()
      ports.bridge.seedMetadata('has-tag.md', {
        path: 'has-tag.md',
        tags: [],
        frontmatter: { categories: ['alpha', 'beta'] },
        links: [],
        embeds: [],
      })
      ports.bridge.seedMetadata('no-tag.md', {
        path: 'no-tag.md',
        tags: [],
        frontmatter: { categories: ['gamma'] },
        links: [],
        embeds: [],
      })
      ports.vault.seedFile('has-tag.md', '')
      ports.vault.seedFile('no-tag.md', '')

      const res = (await getHandler(
        server,
        'metadata.search',
      )({
        field: 'categories',
        contains: 'alpha',
      })) as { structuredContent: { paths: string[] } }

      expect(res.structuredContent.paths).toContain('has-tag.md')
      expect(res.structuredContent.paths).not.toContain('no-tag.md')
    })
  })

  describe('frontmatter.set', () => {
    it('adds a new field that did not previously exist', async () => {
      const { server, ports } = setup()
      await ports.vault.writeFile('note.md', '---\ntitle: Test\n---\nbody text')

      const result = (await getHandler(
        server,
        'frontmatter.set',
      )({
        path: 'note.md',
        field: 'status',
        value: 'active',
      })) as { structuredContent: Record<string, unknown>; content: [{ text: string }] }

      // structuredContent must be present (outputSchema declared)
      expect(result).toHaveProperty('structuredContent')
      expect(result.structuredContent['field']).toBe('status')
      expect(result.structuredContent['previousValue']).toBeUndefined()
      expect(result.structuredContent['newValue']).toBe('active')

      // text fallback consistency
      const parsed = JSON.parse(result.content[0].text) as {
        path: string
        field: string
        previousValue: unknown
        newValue: unknown
      }
      expect(parsed.field).toBe('status')
      expect(parsed.previousValue).toBeUndefined()
      expect(parsed.newValue).toBe('active')

      // Verify the file was actually updated
      const updated = await ports.vault.readFile('note.md')
      expect(updated).toContain('status:')
    })

    it('updates an existing field and captures the previous value', async () => {
      const { server, ports } = setup()
      await ports.vault.writeFile('note.md', '---\nstatus: draft\n---\nbody')

      const result = (await getHandler(
        server,
        'frontmatter.set',
      )({
        path: 'note.md',
        field: 'status',
        value: 'published',
      })) as { content: [{ text: string }] }

      const parsed = JSON.parse(result.content[0].text) as {
        previousValue: unknown
        newValue: unknown
      }
      expect(parsed.previousValue).toBe('draft')
      expect(parsed.newValue).toBe('published')

      const updated = await ports.vault.readFile('note.md')
      expect(updated).toContain('published')
      expect(updated).not.toContain('draft')
    })

    it('deletes a field when value is null', async () => {
      const { server, ports } = setup()
      await ports.vault.writeFile('note.md', '---\ntitle: Hello\ndelete_me: yes\n---\nbody')

      const result = (await getHandler(
        server,
        'frontmatter.set',
      )({
        path: 'note.md',
        field: 'delete_me',
        value: null,
      })) as { content: [{ text: string }] }

      const parsed = JSON.parse(result.content[0].text) as {
        previousValue: unknown
        newValue: unknown
      }
      expect(parsed.previousValue).toBe('yes')
      expect(parsed.newValue).toBeUndefined()

      const updated = await ports.vault.readFile('note.md')
      expect(updated).not.toContain('delete_me')
      expect(updated).toContain('title:')
    })

    it('returns error for unsafe path (path traversal rejected)', async () => {
      const { server } = setup()

      const result = (await getHandler(
        server,
        'frontmatter.set',
      )({
        path: '../outside.md',
        field: 'status',
        value: 'bad',
      })) as { isError: boolean; content: [{ text: string }] }

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('unsafe path')
    })

    it('gate deny returns deny envelope without modifying file', async () => {
      const ports = fakeModulePorts()
      ports.confirmModal.answerWith('deny')
      const denyGate = new PermissionGate(
        { getSettings: () => ({ ...DEFAULT_SETTINGS, defaultMode: 'ask' as const }) },
        ports.confirmModal,
      )
      const s = new McpServer({ name: 'test', version: '0.0.0' })
      registerMetadataTools(s, {
        metadata: ports.metadataCache,
        vault: ports.vault,
        gate: denyGate,
      })

      await ports.vault.writeFile('secret.md', '---\ntitle: Secret\n---\nbody')

      const result = (await getHandler(
        s,
        'frontmatter.set',
      )({
        path: 'secret.md',
        field: 'status',
        value: 'leaked',
      })) as { isError: boolean; content: [{ text: string }] }

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('denied')

      // File must be unmodified
      const content = await ports.vault.readFile('secret.md')
      expect(content).not.toContain('leaked')
    })
  })

  describe('frontmatter.query', () => {
    it('registers the frontmatter.query tool', () => {
      const { server } = setup()
      const handler = getHandler(server, 'frontmatter.query')
      expect(typeof handler).toBe('function')
    })

    it('returns matches for eq condition', async () => {
      const { server, ports } = setup()
      ports.vault.seedFile('a.md', '')
      ports.vault.seedFile('b.md', '')
      ports.metadataCache.seedMetadata('a.md', {
        path: 'a.md',
        tags: [],
        frontmatter: { status: 'done' },
        links: [],
        embeds: [],
      })
      ports.metadataCache.seedMetadata('b.md', {
        path: 'b.md',
        tags: [],
        frontmatter: { status: 'todo' },
        links: [],
        embeds: [],
      })

      const result = (await getHandler(
        server,
        'frontmatter.query',
      )({
        where: [{ field: 'status', op: 'eq', value: 'done' }],
        op: 'AND',
      })) as { structuredContent: { matches: Array<{ path: string }>; count: number } }

      expect(result.structuredContent.count).toBe(1)
      expect(result.structuredContent.matches[0]?.path).toBe('a.md')
    })

    it('returns empty on no-match', async () => {
      const { server, ports } = setup()
      ports.vault.seedFile('a.md', '')
      ports.metadataCache.seedMetadata('a.md', {
        path: 'a.md',
        tags: [],
        frontmatter: { status: 'todo' },
        links: [],
        embeds: [],
      })

      const result = (await getHandler(
        server,
        'frontmatter.query',
      )({
        where: [{ field: 'status', op: 'eq', value: 'done' }],
        op: 'AND',
      })) as { structuredContent: { count: number } }

      expect(result.structuredContent.count).toBe(0)
    })

    it('supports OR combinator', async () => {
      const { server, ports } = setup()
      ports.vault.seedFile('a.md', '')
      ports.vault.seedFile('b.md', '')
      ports.vault.seedFile('c.md', '')
      ports.metadataCache.seedMetadata('a.md', {
        path: 'a.md',
        tags: [],
        frontmatter: { status: 'done' },
        links: [],
        embeds: [],
      })
      ports.metadataCache.seedMetadata('b.md', {
        path: 'b.md',
        tags: [],
        frontmatter: { priority: 'high' },
        links: [],
        embeds: [],
      })
      ports.metadataCache.seedMetadata('c.md', {
        path: 'c.md',
        tags: [],
        frontmatter: { other: 'x' },
        links: [],
        embeds: [],
      })

      const result = (await getHandler(
        server,
        'frontmatter.query',
      )({
        where: [
          { field: 'status', op: 'eq', value: 'done' },
          { field: 'priority', op: 'eq', value: 'high' },
        ],
        op: 'OR',
      })) as { structuredContent: { count: number } }

      expect(result.structuredContent.count).toBe(2)
    })

    it('returns error for unsafe folder', async () => {
      const { server } = setup()
      const result = (await getHandler(
        server,
        'frontmatter.query',
      )({
        folder: '../outside',
        where: [{ field: 'x', op: 'exists' }],
        op: 'AND',
      })) as { isError: boolean }
      expect(result.isError).toBe(true)
    })
  })
})
