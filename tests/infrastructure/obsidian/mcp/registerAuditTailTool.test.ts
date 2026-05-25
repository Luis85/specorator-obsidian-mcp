import { describe, it, expect } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerAuditTailTool } from '@/infrastructure/obsidian/mcp/registerAuditTool'
import { fakeModulePorts } from '@@/__fakes__/fake-ports'
import { getHandler } from '@@/__fakes__/gate-helpers'

function setup() {
  const ports = fakeModulePorts()
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  registerAuditTailTool(server, { vault: ports.vault })
  return { server, ports }
}

describe('audit.tail', () => {
  it('registers the audit.tail tool', () => {
    const { server } = setup()
    const handler = getHandler(server, 'audit.tail')
    expect(typeof handler).toBe('function')
  })

  it('returns last N entries from a seeded log', async () => {
    const { server, ports } = setup()
    const lines = Array.from({ length: 10 }, (_, i) => JSON.stringify({ seq: i, tool: `tool${i}` }))
    ports.vault.seedFile('.specorator/audit-log.jsonl', lines.join('\n'))

    const result = (await getHandler(server, 'audit.tail')({ n: 3 })) as {
      structuredContent: { entries: Array<Record<string, unknown>>; count: number }
    }

    expect(result.structuredContent.count).toBe(3)
    expect(result.structuredContent.entries).toHaveLength(3)
    expect(result.structuredContent.entries[0]).toEqual({ seq: 7, tool: 'tool7' })
    expect(result.structuredContent.entries[2]).toEqual({ seq: 9, tool: 'tool9' })
  })

  it('marks malformed lines as { invalid: line }', async () => {
    const { server, ports } = setup()
    ports.vault.seedFile('.specorator/audit-log.jsonl', '{"ok":true}\nNOT_JSON\n{"also":"ok"}')

    const result = (await getHandler(server, 'audit.tail')({ n: 10 })) as {
      structuredContent: { entries: Array<Record<string, unknown>>; count: number }
    }

    expect(result.structuredContent.count).toBe(3)
    expect(result.structuredContent.entries[1]).toEqual({ invalid: 'NOT_JSON' })
  })

  it('returns count 0 for an empty log', async () => {
    const { server, ports } = setup()
    ports.vault.seedFile('.specorator/audit-log.jsonl', '')

    const result = (await getHandler(server, 'audit.tail')({ n: 50 })) as {
      structuredContent: { count: number }
    }

    expect(result.structuredContent.count).toBe(0)
  })

  it('returns count 0 when log file does not exist', async () => {
    const { server } = setup()
    // No file seeded — readFile will reject

    const result = (await getHandler(server, 'audit.tail')({ n: 50 })) as {
      structuredContent: { count: number }
    }

    expect(result.structuredContent.count).toBe(0)
  })

  it('returns structuredContent (okStructured regression — MCP SDK ≥1.10)', async () => {
    const { server, ports } = setup()
    ports.vault.seedFile('.specorator/audit-log.jsonl', '{"x":1}')

    const result = (await getHandler(server, 'audit.tail')({ n: 5 })) as {
      structuredContent: { entries: unknown[]; count: number }
      content: [{ text: string }]
    }

    expect(result).toHaveProperty('structuredContent')
    expect(result.structuredContent.count).toBe(1)
    const parsed = JSON.parse(result.content[0].text) as { count: number }
    expect(parsed.count).toBe(result.structuredContent.count)
  })
})
