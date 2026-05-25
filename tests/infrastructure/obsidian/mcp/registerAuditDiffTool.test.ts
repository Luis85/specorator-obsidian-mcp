import { describe, it, expect } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerRemediationTools } from '@/infrastructure/obsidian/mcp/registerRemediationTools'
import { fakeModulePorts } from '@@/__fakes__/fake-ports'
import { makeAllowGate, getHandler } from '@@/__fakes__/gate-helpers'

function setup() {
  const ports = fakeModulePorts()
  const gate = makeAllowGate(ports.confirmModal)
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  registerRemediationTools(server, { vault: ports.vault, metadata: ports.metadataCache, gate })
  return { server, ports, gate }
}

describe('audit.diff', () => {
  it('registers the audit.diff tool', () => {
    const { server } = setup()
    const handler = getHandler(server, 'audit.diff')
    expect(typeof handler).toBe('function')
  })

  it('returns error for unsafe baseline path', async () => {
    const { server } = setup()
    const res = (await getHandler(
      server,
      'audit.diff',
    )({
      baselinePath: '../outside/baseline.json',
    })) as { isError: boolean; content: [{ text: string }] }
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('unsafe path')
  })

  it('returns error when baseline file does not exist', async () => {
    const { server } = setup()
    const res = (await getHandler(
      server,
      'audit.diff',
    )({
      baselinePath: 'audit/missing-baseline.json',
    })) as { isError: boolean; content: [{ text: string }] }
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('baseline not found')
  })

  it('returns error for malformed baseline JSON', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('audit/bad.json', 'NOT_JSON{{{')
    const res = (await getHandler(
      server,
      'audit.diff',
    )({
      baselinePath: 'audit/bad.json',
    })) as { isError: boolean; content: [{ text: string }] }
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('baseline JSON parse error')
  })

  it('happy path: added/resolved/unchanged computed correctly', async () => {
    const { server, ports } = setup()

    // Baseline had 3 orphans: a.md, b.md, c.md
    const baseline = {
      folder: '',
      totalFiles: 3,
      checksRun: ['orphans'],
      findings: {
        orphans: ['a.md', 'b.md', 'c.md'],
      },
      counts: { orphans: 3 },
    }
    await ports.vault.writeFile('audit/baseline.json', JSON.stringify(baseline))

    // Seed current vault: a.md and b.md still orphans, d.md is new orphan, c.md is now linked
    ports.vault.seedFile('a.md', '# A')
    ports.vault.seedFile('b.md', '# B')
    ports.vault.seedFile('c.md', '# C')
    ports.vault.seedFile('d.md', '# D')
    // Give c.md a backlink so it's no longer an orphan
    ports.metadataCache.seedBacklinks('c.md', ['somewhere.md'])
    // a.md, b.md, d.md have no backlinks → orphans

    const res = (await getHandler(
      server,
      'audit.diff',
    )({
      baselinePath: 'audit/baseline.json',
      checks: ['orphans'],
    })) as {
      structuredContent: {
        baselinePath: string
        generatedAt: string
        checks: Record<string, { added: string[]; resolved: string[]; unchanged: number }>
      }
    }

    expect(res.structuredContent.baselinePath).toBe('audit/baseline.json')
    expect(typeof res.structuredContent.generatedAt).toBe('string')

    const orphanDiff = res.structuredContent.checks['orphans']
    expect(orphanDiff).toBeDefined()
    // d.md is new (added), c.md was resolved, a.md + b.md are unchanged
    expect(orphanDiff!.added).toContain('d.md')
    expect(orphanDiff!.resolved).toContain('c.md')
    expect(orphanDiff!.unchanged).toBe(2)
  })

  it('normalises object findings with {path:...} shape', async () => {
    const { server, ports } = setup()

    // baseline large_files uses {path, bytes} objects
    const baseline = {
      folder: '',
      totalFiles: 1,
      checksRun: ['large_files'],
      findings: {
        large_files: [{ path: 'big.md', bytes: 2_000_000 }],
      },
      counts: { large_files: 1 },
    }
    await ports.vault.writeFile('audit/lf-baseline.json', JSON.stringify(baseline))
    // big.md is no longer in vault → 0 large files currently
    // (vault is empty, so no large files detected)

    const res = (await getHandler(
      server,
      'audit.diff',
    )({
      baselinePath: 'audit/lf-baseline.json',
      checks: ['large_files'],
    })) as {
      structuredContent: {
        checks: Record<string, { added: string[]; resolved: string[]; unchanged: number }>
      }
    }

    const lfDiff = res.structuredContent.checks['large_files']
    expect(lfDiff).toBeDefined()
    // big.md was in baseline but not in current → resolved
    expect(lfDiff!.resolved).toContain('big.md')
    expect(lfDiff!.added).toHaveLength(0)
    expect(lfDiff!.unchanged).toBe(0)
  })

  it('normalises unresolved_links shape {source, target}', async () => {
    const { server, ports } = setup()

    const baseline = {
      folder: '',
      totalFiles: 1,
      checksRun: ['unresolved_links'],
      findings: {
        unresolved_links: [{ source: 'note.md', target: 'Ghost' }],
      },
      counts: { unresolved_links: 1 },
    }
    await ports.vault.writeFile('audit/ul-baseline.json', JSON.stringify(baseline))
    // No files in vault → no unresolved links found currently

    const res = (await getHandler(
      server,
      'audit.diff',
    )({
      baselinePath: 'audit/ul-baseline.json',
      checks: ['unresolved_links'],
    })) as {
      structuredContent: {
        checks: Record<string, { added: string[]; resolved: string[]; unchanged: number }>
      }
    }

    const ulDiff = res.structuredContent.checks['unresolved_links']
    expect(ulDiff).toBeDefined()
    expect(ulDiff!.resolved).toContain('note.md → Ghost')
    expect(ulDiff!.added).toHaveLength(0)
  })
})
