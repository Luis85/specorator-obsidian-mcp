import { describe, it, expect } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerAuditTool } from '@/infrastructure/obsidian/mcp/registerAuditTool'
import { fakeModulePorts } from '@@/__fakes__/fake-ports'
import { getHandler } from '@@/__fakes__/gate-helpers'

function setup() {
  const ports = fakeModulePorts()
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  registerAuditTool(server, { vault: ports.vault, metadata: ports.metadataCache })
  return { server, ports }
}

describe('registerAuditTool', () => {
  it('registers the audit.report tool', () => {
    const { server } = setup()
    // Confirms handler is present — getHandler throws if missing
    const handler = getHandler(server, 'audit.report')
    expect(typeof handler).toBe('function')
  })

  it('returns a report with all checks when no checks param given', async () => {
    const { server, ports } = setup()
    ports.vault.seedFile('a.md', '# A')
    ports.vault.seedFile('b.md', '# B')

    const result = (await getHandler(server, 'audit.report')({})) as {
      structuredContent: {
        totalFiles: number
        checksRun: string[]
        findings: Record<string, unknown>
        counts: Record<string, number>
      }
    }

    expect(result.structuredContent.totalFiles).toBe(2)
    expect(result.structuredContent.checksRun).toHaveLength(6)
    expect(result.structuredContent.findings['orphans']).toBeDefined()
    expect(result.structuredContent.findings['deadends']).toBeDefined()
    expect(result.structuredContent.findings['unresolved_links']).toBeDefined()
  })

  it('runs only the requested checks', async () => {
    const { server, ports } = setup()
    ports.vault.seedFile('note.md', '# Note')

    const result = (await getHandler(
      server,
      'audit.report',
    )({ checks: ['orphans', 'deadends'] })) as {
      structuredContent: {
        checksRun: string[]
        findings: Record<string, unknown>
      }
    }

    expect(result.structuredContent.checksRun).toEqual(['orphans', 'deadends'])
    expect(result.structuredContent.findings['orphans']).toBeDefined()
    expect(result.structuredContent.findings['deadends']).toBeDefined()
    expect(result.structuredContent.findings['unresolved_links']).toBeUndefined()
    expect(result.structuredContent.findings['tag_dupes']).toBeUndefined()
  })

  it('detects orphans (notes with zero backlinks)', async () => {
    const { server, ports } = setup()
    ports.vault.seedFile('orphan.md', '# Orphan')
    ports.vault.seedFile('linked.md', '# Linked')
    ports.metadataCache.seedBacklinks('linked.md', ['someone.md'])

    const result = (await getHandler(server, 'audit.report')({ checks: ['orphans'] })) as {
      structuredContent: {
        findings: { orphans?: string[] }
        counts: Record<string, number>
      }
    }

    expect(result.structuredContent.findings.orphans).toContain('orphan.md')
    expect(result.structuredContent.findings.orphans).not.toContain('linked.md')
    expect(result.structuredContent.counts['orphans']).toBe(1)
  })

  it('detects unresolved wikilinks', async () => {
    const { server, ports } = setup()
    ports.vault.seedFile('src.md', '# Source')
    ports.metadataCache.seedMetadata('src.md', {
      path: 'src.md',
      tags: [],
      frontmatter: {},
      links: ['Ghost'],
      embeds: [],
    })
    // No linkpathDest seeded for 'Ghost' → null → unresolved

    const result = (await getHandler(server, 'audit.report')({ checks: ['unresolved_links'] })) as {
      structuredContent: {
        findings: { unresolved_links?: Array<{ source: string; target: string }> }
        counts: Record<string, number>
      }
    }

    expect(result.structuredContent.findings.unresolved_links).toHaveLength(1)
    expect(result.structuredContent.findings.unresolved_links![0]).toEqual({
      source: 'src.md',
      target: 'Ghost',
    })
    expect(result.structuredContent.counts['unresolved_links']).toBe(1)
  })

  it('returns error for unsafe folder path', async () => {
    const { server } = setup()

    const result = (await getHandler(server, 'audit.report')({ folder: '../outside' })) as {
      isError: boolean
      content: [{ text: string }]
    }

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('unsafe path')
  })

  it('scopes audit to a subfolder', async () => {
    const { server, ports } = setup()
    ports.vault.seedFile('sub/a.md', '# A')
    ports.vault.seedFile('root.md', '# Root')

    const result = (await getHandler(server, 'audit.report')({ folder: 'sub' })) as {
      structuredContent: {
        totalFiles: number
        folder: string
      }
    }

    expect(result.structuredContent.folder).toBe('sub')
    expect(result.structuredContent.totalFiles).toBe(1)
  })

  it('returns structuredContent matching outputSchema (MCP SDK ≥1.10 regression)', async () => {
    const { server, ports } = setup()
    ports.vault.seedFile('a.md', '# A')

    const result = (await getHandler(server, 'audit.report')({})) as {
      structuredContent: {
        totalFiles: number
        checksRun: string[]
        findings: Record<string, unknown>
        counts: Record<string, number>
      }
      content: [{ text: string }]
    }

    expect(result).toHaveProperty('structuredContent')
    expect(typeof result.structuredContent.totalFiles).toBe('number')
    expect(Array.isArray(result.structuredContent.checksRun)).toBe(true)
    // text content must also be present for backwards-compatible clients
    const parsed = JSON.parse(result.content[0].text) as { totalFiles: number }
    expect(parsed.totalFiles).toBe(result.structuredContent.totalFiles)
  })
})
