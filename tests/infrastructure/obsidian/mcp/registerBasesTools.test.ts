import { describe, it, expect } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerBasesTools } from '@/infrastructure/obsidian/mcp/registerBasesTools'
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
  registerBasesTools(server, { vault: ports.vault })
  const tools = (server as unknown as ServerInternal)._registeredTools
  return { server, ports, tools }
}

describe('registerBasesTools', () => {
  it('registers exactly the two canonical bases tools', () => {
    const { server } = setup()
    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools
    const expected = Object.keys(DEFAULT_TOOL_MODES).filter((k) => k.startsWith('bases.')).sort()
    expect(Object.keys(tools).sort()).toEqual(expected)
  })

  it('bases.list returns all frontmatter records in folder', async () => {
    const { tools, ports } = setup()
    await ports.vault.writeFile('db/a.md', '---\nstatus: active\n---\n')
    await ports.vault.writeFile('db/b.md', '---\nstatus: archived\n---\n')
    const result = (await tools['bases.list'].handler({ folder: 'db' })) as {
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
    const { tools, ports } = setup()
    await ports.vault.writeFile('db/note.md', '---\ntype: note\n---\n')
    await ports.vault.writeFile('db/image.png', 'binarydata')
    const result = (await tools['bases.list'].handler({ folder: 'db' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as {
      records: Array<{ path: string }>
    }
    const paths = parsed.records.map((r) => r.path)
    expect(paths).not.toContain('db/image.png')
  })

  it('bases.filter returns only matching records (eq)', async () => {
    const { tools, ports } = setup()
    await ports.vault.writeFile('proj/a.md', '---\nstatus: active\n---\n')
    await ports.vault.writeFile('proj/b.md', '---\nstatus: archived\n---\n')
    await ports.vault.writeFile('proj/c.md', '---\nstatus: active\n---\n')
    const result = (await tools['bases.filter'].handler({
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

  it('bases.filter supports contains op on string', async () => {
    const { tools, ports } = setup()
    await ports.vault.writeFile('t/x.md', '---\ntitle: Hello World\n---\n')
    await ports.vault.writeFile('t/y.md', '---\ntitle: Goodbye\n---\n')
    const result = (await tools['bases.filter'].handler({
      folder: 't',
      filter: { field: 'title', op: 'contains', value: 'Hello' },
    })) as { content: [{ text: string }] }
    const parsed = JSON.parse(result.content[0].text) as { records: Array<{ path: string }> }
    expect(parsed.records).toHaveLength(1)
    expect(parsed.records[0].path).toBe('t/x.md')
  })
})
