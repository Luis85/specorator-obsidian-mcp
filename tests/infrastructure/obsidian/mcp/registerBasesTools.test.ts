import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerBasesTools } from '@/infrastructure/obsidian/mcp/registerBasesTools'
import { fakeModulePorts } from '@@/__fakes__/fake-ports'
import { DEFAULT_TOOL_MODES } from '@/domain/settings/PluginSettings'
import { getHandler, getRegisteredTools } from '@@/__fakes__/gate-helpers'

const FilterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.unknown()),
])

function setup() {
  const ports = fakeModulePorts()
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  registerBasesTools(server, { vault: ports.vault })
  return { server, ports }
}

describe('registerBasesTools', () => {
  it('registers exactly the two canonical bases tools', () => {
    const { server } = setup()
    const tools = getRegisteredTools(server)
    const expected = Object.keys(DEFAULT_TOOL_MODES)
      .filter((k) => k.startsWith('bases.'))
      .sort()
    expect(Object.keys(tools).sort()).toEqual(expected)
  })

  it('bases.list returns all frontmatter records in folder', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('db/a.md', '---\nstatus: active\n---\n')
    await ports.vault.writeFile('db/b.md', '---\nstatus: archived\n---\n')
    const result = (await getHandler(server, 'bases.list')({ folder: 'db' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as {
      records: Array<{ path: string; frontmatter: Record<string, unknown> }>
    }
    expect(parsed.records).toHaveLength(2)
    const paths = parsed.records.map((r) => r.path)
    expect(paths).toContain('db/a.md')
    expect(paths).toContain('db/b.md')
  })

  it('bases.list skips non-.md files', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('db/note.md', '---\ntype: note\n---\n')
    await ports.vault.writeFile('db/image.png', 'binarydata')
    const result = (await getHandler(server, 'bases.list')({ folder: 'db' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as {
      records: Array<{ path: string }>
    }
    const paths = parsed.records.map((r) => r.path)
    expect(paths).not.toContain('db/image.png')
  })

  it('bases.filter returns only matching records (eq)', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('proj/a.md', '---\nstatus: active\n---\n')
    await ports.vault.writeFile('proj/b.md', '---\nstatus: archived\n---\n')
    await ports.vault.writeFile('proj/c.md', '---\nstatus: active\n---\n')
    const result = (await getHandler(
      server,
      'bases.filter',
    )({
      folder: 'proj',
      filter: { field: 'status', op: 'eq', value: 'active' },
    })) as { content: [{ text: string }] }
    const parsed = JSON.parse(result.content[0].text) as {
      records: Array<{ path: string }>
    }
    expect(parsed.records).toHaveLength(2)
    const paths = parsed.records.map((r) => r.path)
    expect(paths).toContain('proj/a.md')
    expect(paths).toContain('proj/c.md')
    expect(paths).not.toContain('proj/b.md')
  })

  describe('bases.filter value schema', () => {
    it('rejects object-as-filter-value', () => {
      const result = FilterValueSchema.safeParse({ nested: 'obj' })
      expect(result.success).toBe(false)
    })

    it('accepts string filter value', () => {
      expect(FilterValueSchema.safeParse('active').success).toBe(true)
    })

    it('accepts number filter value', () => {
      expect(FilterValueSchema.safeParse(42).success).toBe(true)
    })

    it('accepts boolean filter value', () => {
      expect(FilterValueSchema.safeParse(true).success).toBe(true)
    })

    it('accepts null filter value', () => {
      expect(FilterValueSchema.safeParse(null).success).toBe(true)
    })

    it('accepts array filter value (for in operator)', () => {
      expect(FilterValueSchema.safeParse(['a', 'b']).success).toBe(true)
    })
  })

  it('bases.filter supports contains op on string', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('t/x.md', '---\ntitle: Hello World\n---\n')
    await ports.vault.writeFile('t/y.md', '---\ntitle: Goodbye\n---\n')
    const result = (await getHandler(
      server,
      'bases.filter',
    )({
      folder: 't',
      filter: { field: 'title', op: 'contains', value: 'Hello' },
    })) as { content: [{ text: string }] }
    const parsed = JSON.parse(result.content[0].text) as { records: Array<{ path: string }> }
    expect(parsed.records).toHaveLength(1)
    expect(parsed.records[0]!.path).toBe('t/x.md')
  })
})
