import { describe, it, expect } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerGraphTools } from '@/infrastructure/obsidian/mcp/registerGraphTools'
import { fakeModulePorts } from '@@/__fakes__/fake-ports'
import { getHandler } from '@@/__fakes__/gate-helpers'

function setup() {
  const ports = fakeModulePorts()
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  registerGraphTools(server, { vault: ports.vault, metadata: ports.metadataCache })
  return { server, ports }
}

// ── graph.stats registration ─────────────────────────────────────────────────

describe('registerGraphTools — graph.stats', () => {
  it('registers the graph.stats tool', () => {
    const { server } = setup()
    const handler = getHandler(server, 'graph.stats')
    expect(typeof handler).toBe('function')
  })

  it('returns zero stats for empty vault', async () => {
    const { server } = setup()
    const result = (await getHandler(server, 'graph.stats')({})) as {
      structuredContent: Record<string, unknown>
    }
    const s = result.structuredContent
    expect(s['totalNotes']).toBe(0)
    expect(s['totalLinks']).toBe(0)
    expect(s['components']).toBe(0)
    expect(s['orphans']).toBe(0)
    expect(s['deadends']).toBe(0)
    expect(s['hubs']).toEqual([])
    expect(s['orphanPercent']).toBe(0)
  })

  it('counts notes and links', async () => {
    const { server, ports } = setup()
    ports.vault.seedFile('a.md', '# A')
    ports.vault.seedFile('b.md', '# B')
    ports.metadataCache.seedResolvedLinks('a.md', { 'b.md': 1 })

    const result = (await getHandler(server, 'graph.stats')({})) as {
      structuredContent: Record<string, unknown>
    }
    const s = result.structuredContent

    expect(s['totalNotes']).toBe(2)
    expect(s['totalLinks']).toBe(1)
    expect(s['orphans']).toBe(1) // a has no in-links
    expect(s['deadends']).toBe(1) // b has no out-links
  })

  it('identifies top hubs by in-degree', async () => {
    const { server, ports } = setup()
    ports.vault.seedFile('hub.md', '# Hub')
    ports.vault.seedFile('leaf.md', '# Leaf')
    ports.metadataCache.seedResolvedLinks('leaf.md', { 'hub.md': 5 })

    const result = (await getHandler(server, 'graph.stats')({})) as {
      structuredContent: Record<string, unknown>
    }
    const hubs = result.structuredContent['hubs'] as Array<{ path: string; inDegree: number }>

    expect(hubs[0]?.path).toBe('hub.md')
    expect(hubs[0]?.inDegree).toBe(5)
  })

  it('returns error for unsafe folder path', async () => {
    const { server } = setup()
    const result = (await getHandler(server, 'graph.stats')({ folder: '../outside' })) as {
      isError: boolean
      content: [{ text: string }]
    }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('unsafe path')
  })

  it('scopes to subfolder', async () => {
    const { server, ports } = setup()
    ports.vault.seedFile('sub/a.md', '# A')
    ports.vault.seedFile('root.md', '# Root')

    const result = (await getHandler(server, 'graph.stats')({ folder: 'sub' })) as {
      structuredContent: Record<string, unknown>
    }

    expect(result.structuredContent['totalNotes']).toBe(1)
  })
})

// ── graph.orphans registration ───────────────────────────────────────────────

describe('registerGraphTools — graph.orphans', () => {
  it('registers the graph.orphans tool', () => {
    const { server } = setup()
    const handler = getHandler(server, 'graph.orphans')
    expect(typeof handler).toBe('function')
  })

  it('returns orphan list with path, lastModified, bytes', async () => {
    const { server, ports } = setup()
    ports.vault.seedFile('orphan.md', '# Orphan note')
    ports.vault.seedFile('linked.md', '# Linked')
    ports.metadataCache.seedBacklinks('linked.md', ['someone.md'])

    const result = (await getHandler(server, 'graph.orphans')({})) as {
      structuredContent: {
        orphans: Array<{ path: string; lastModified: string; bytes: number }>
        count: number
      }
    }
    const { orphans, count } = result.structuredContent

    expect(count).toBe(1)
    expect(orphans[0]?.path).toBe('orphan.md')
    expect(typeof orphans[0]?.lastModified).toBe('string')
    expect(orphans[0]?.bytes).toBeGreaterThan(0)
  })

  it('returns empty when no orphans', async () => {
    const { server, ports } = setup()
    ports.vault.seedFile('a.md', '# A')
    ports.metadataCache.seedBacklinks('a.md', ['other.md'])

    const result = (await getHandler(server, 'graph.orphans')({})) as {
      structuredContent: { count: number }
    }

    expect(result.structuredContent.count).toBe(0)
  })

  it('filters by staleDays', async () => {
    const { server, ports } = setup()
    ports.vault.seedFile('old.md', '# Old')
    ports.vault.seedFile('recent.md', '# Recent')
    const now = Date.now()
    ports.vault.seedFileStats('old.md', { mtime: now - 20 * 86_400_000 })
    ports.vault.seedFileStats('recent.md', { mtime: now })

    const result = (await getHandler(server, 'graph.orphans')({ staleDays: 10 })) as {
      structuredContent: { orphans: Array<{ path: string }>; count: number }
    }

    expect(result.structuredContent.count).toBe(1)
    expect(result.structuredContent.orphans[0]?.path).toBe('old.md')
  })

  it('returns error for unsafe path', async () => {
    const { server } = setup()
    const result = (await getHandler(server, 'graph.orphans')({ folder: '../x' })) as {
      isError: boolean
    }
    expect(result.isError).toBe(true)
  })
})

// ── graph.deadends registration ──────────────────────────────────────────────

describe('registerGraphTools — graph.deadends', () => {
  it('registers the graph.deadends tool', () => {
    const { server } = setup()
    const handler = getHandler(server, 'graph.deadends')
    expect(typeof handler).toBe('function')
  })

  it('returns deadend list and count', async () => {
    const { server, ports } = setup()
    ports.vault.seedFile('dead.md', '# Dead end')
    ports.vault.seedFile('linked.md', '# Has outgoing link')
    ports.metadataCache.seedResolvedLinks('linked.md', { 'dead.md': 1 })

    const result = (await getHandler(server, 'graph.deadends')({})) as {
      structuredContent: { deadends: string[]; count: number }
    }

    expect(result.structuredContent.count).toBe(1)
    expect(result.structuredContent.deadends).toContain('dead.md')
    expect(result.structuredContent.deadends).not.toContain('linked.md')
  })

  it('returns empty when no dead ends', async () => {
    const { server, ports } = setup()
    ports.vault.seedFile('a.md', '# A')
    ports.vault.seedFile('b.md', '# B')
    ports.metadataCache.seedResolvedLinks('a.md', { 'b.md': 1 })
    ports.metadataCache.seedResolvedLinks('b.md', { 'a.md': 1 })

    const result = (await getHandler(server, 'graph.deadends')({})) as {
      structuredContent: { count: number }
    }

    expect(result.structuredContent.count).toBe(0)
  })

  it('returns error for unsafe path', async () => {
    const { server } = setup()
    const result = (await getHandler(server, 'graph.deadends')({ folder: '../x' })) as {
      isError: boolean
    }
    expect(result.isError).toBe(true)
  })
})
