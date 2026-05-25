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
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as {
      totalFiles: number
      checksRun: string[]
      findings: Record<string, unknown>
      counts: Record<string, number>
    }

    expect(parsed.totalFiles).toBe(2)
    expect(parsed.checksRun).toHaveLength(6)
    expect(parsed.findings.orphans).toBeDefined()
    expect(parsed.findings.deadends).toBeDefined()
    expect(parsed.findings.unresolved_links).toBeDefined()
  })

  it('runs only the requested checks', async () => {
    const { server, ports } = setup()
    ports.vault.seedFile('note.md', '# Note')

    const result = (await getHandler(
      server,
      'audit.report',
    )({ checks: ['orphans', 'deadends'] })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as {
      checksRun: string[]
      findings: Record<string, unknown>
    }

    expect(parsed.checksRun).toEqual(['orphans', 'deadends'])
    expect(parsed.findings.orphans).toBeDefined()
    expect(parsed.findings.deadends).toBeDefined()
    expect(parsed.findings.unresolved_links).toBeUndefined()
    expect(parsed.findings.tag_dupes).toBeUndefined()
  })

  it('detects orphans (notes with zero backlinks)', async () => {
    const { server, ports } = setup()
    ports.vault.seedFile('orphan.md', '# Orphan')
    ports.vault.seedFile('linked.md', '# Linked')
    ports.metadataCache.seedBacklinks('linked.md', ['someone.md'])

    const result = (await getHandler(server, 'audit.report')({ checks: ['orphans'] })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as {
      findings: { orphans?: string[] }
      counts: Record<string, number>
    }

    expect(parsed.findings.orphans).toContain('orphan.md')
    expect(parsed.findings.orphans).not.toContain('linked.md')
    expect(parsed.counts['orphans']).toBe(1)
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
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as {
      findings: { unresolved_links?: Array<{ source: string; target: string }> }
      counts: Record<string, number>
    }

    expect(parsed.findings.unresolved_links).toHaveLength(1)
    expect(parsed.findings.unresolved_links![0]).toEqual({ source: 'src.md', target: 'Ghost' })
    expect(parsed.counts['unresolved_links']).toBe(1)
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
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as {
      totalFiles: number
      folder: string
    }

    expect(parsed.folder).toBe('sub')
    expect(parsed.totalFiles).toBe(1)
  })
})
