import { describe, it, expect } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerRemediationTools } from '@/infrastructure/obsidian/mcp/registerRemediationTools'
import { PermissionGate } from '@/application/mcp/PermissionGate'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
import { fakeModulePorts } from '@@/__fakes__/fake-ports'
import { makeAllowGate, getHandler } from '@@/__fakes__/gate-helpers'

function setup() {
  const ports = fakeModulePorts()
  const gate = makeAllowGate(ports.confirmModal)
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  registerRemediationTools(server, { vault: ports.vault, metadata: ports.metadataCache, gate })
  return { server, ports, gate }
}

// ---------------------------------------------------------------------------
// tags.rename
// ---------------------------------------------------------------------------

describe('tags.rename', () => {
  it('dryRun=true reports changes without writing', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('a.md', 'A note with #oldtag here.')
    const res = (await getHandler(
      server,
      'tags.rename',
    )({
      oldTag: 'oldtag',
      newTag: 'newtag',
      dryRun: true,
    })) as {
      structuredContent: {
        changed: Array<{ path: string; occurrences: number }>
        totalChanges: number
        dryRun: boolean
      }
    }
    expect(res.structuredContent.dryRun).toBe(true)
    expect(res.structuredContent.changed).toHaveLength(1)
    expect(res.structuredContent.totalChanges).toBe(1)
    // File should NOT be modified
    expect(await ports.vault.readFile('a.md')).toContain('#oldtag')
  })

  it('dryRun=false applies changes', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('b.md', 'Note with #oldtag.')
    const res = (await getHandler(
      server,
      'tags.rename',
    )({
      oldTag: 'oldtag',
      newTag: 'newtag',
      dryRun: false,
    })) as { structuredContent: { dryRun: boolean; totalChanges: number } }
    expect(res.structuredContent.dryRun).toBe(false)
    expect(res.structuredContent.totalChanges).toBeGreaterThan(0)
    const written = await ports.vault.readFile('b.md')
    expect(written).toContain('#newtag')
    expect(written).not.toContain('#oldtag')
  })

  it('renames tag in frontmatter tags array', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('c.md', '---\ntags:\n  - oldtag\n  - other\n---\nbody')
    await getHandler(
      server,
      'tags.rename',
    )({
      oldTag: 'oldtag',
      newTag: 'newtag',
      dryRun: false,
    })
    const written = await ports.vault.readFile('c.md')
    expect(written).toContain('newtag')
    expect(written).not.toContain('oldtag')
  })

  it('returns empty changed array when no files have the tag', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('d.md', 'No tags here at all.')
    const res = (await getHandler(
      server,
      'tags.rename',
    )({
      oldTag: 'notpresent',
      newTag: 'x',
      dryRun: true,
    })) as { structuredContent: { changed: unknown[]; totalChanges: number } }
    expect(res.structuredContent.changed).toHaveLength(0)
    expect(res.structuredContent.totalChanges).toBe(0)
  })

  it('gate deny → deny envelope, files not changed', async () => {
    const ports = fakeModulePorts()
    ;(ports.confirmModal as unknown as { answerWith(c: 'deny'): void }).answerWith('deny')
    const gate = new PermissionGate(
      { getSettings: () => ({ ...DEFAULT_SETTINGS, defaultMode: 'ask' as const }) },
      ports.confirmModal,
    )
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerRemediationTools(server, { vault: ports.vault, metadata: ports.metadataCache, gate })
    await ports.vault.writeFile('e.md', '#oldtag text')
    const res = (await getHandler(
      server,
      'tags.rename',
    )({
      oldTag: 'oldtag',
      newTag: 'newtag',
      dryRun: false,
    })) as { isError: boolean }
    expect(res.isError).toBe(true)
    expect(await ports.vault.readFile('e.md')).toContain('#oldtag')
  })

  it('handles folder scoping', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('work/task.md', '#oldtag')
    await ports.vault.writeFile('personal/note.md', '#oldtag')
    const res = (await getHandler(
      server,
      'tags.rename',
    )({
      oldTag: 'oldtag',
      newTag: 'newtag',
      folder: 'work',
      dryRun: true,
    })) as { structuredContent: { changed: Array<{ path: string }> } }
    const paths = res.structuredContent.changed.map((c) => c.path)
    expect(paths).toContain('work/task.md')
    expect(paths).not.toContain('personal/note.md')
  })
})

// ---------------------------------------------------------------------------
// attachments.orphans
// ---------------------------------------------------------------------------

describe('attachments.orphans', () => {
  it('returns unreferenced media file as orphan', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('note.md', 'No embeds here.')
    ports.vault.seedFile('image.png', '\x89PNG...')
    const res = (await getHandler(server, 'attachments.orphans')({})) as {
      structuredContent: {
        orphans: Array<{ path: string; bytes: number }>
        count: number
        totalBytes: number
      }
    }
    expect(res.structuredContent.count).toBeGreaterThanOrEqual(1)
    const paths = res.structuredContent.orphans.map((o) => o.path)
    expect(paths).toContain('image.png')
  })

  it('does not flag referenced media file', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('note.md', '![[image.png]]')
    ports.vault.seedFile('image.png', '\x89PNG')
    const res = (await getHandler(server, 'attachments.orphans')({})) as {
      structuredContent: { orphans: Array<{ path: string }> }
    }
    const paths = res.structuredContent.orphans.map((o) => o.path)
    expect(paths).not.toContain('image.png')
  })

  it('does not flag .md/.canvas/.base files as orphans', async () => {
    const { server, ports } = setup()
    ports.vault.seedFile('note.md', '')
    ports.vault.seedFile('board.canvas', '{}')
    const res = (await getHandler(server, 'attachments.orphans')({})) as {
      structuredContent: { orphans: Array<{ path: string }> }
    }
    const paths = res.structuredContent.orphans.map((o) => o.path)
    expect(paths).not.toContain('note.md')
    expect(paths).not.toContain('board.canvas')
  })

  it('returns totalBytes sum', async () => {
    const { server, ports } = setup()
    ports.vault.seedFile('unused1.png', 'A'.repeat(100))
    ports.vault.seedFile('unused2.jpg', 'B'.repeat(200))
    const res = (await getHandler(server, 'attachments.orphans')({})) as {
      structuredContent: { totalBytes: number; count: number }
    }
    expect(res.structuredContent.count).toBe(2)
    expect(res.structuredContent.totalBytes).toBeGreaterThan(0)
  })

  it('rejects unsafe folder path', async () => {
    const { server } = setup()
    const res = (await getHandler(server, 'attachments.orphans')({ folder: '../outside' })) as {
      isError: boolean
    }
    expect(res.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// audit.export
// ---------------------------------------------------------------------------

describe('audit.export', () => {
  it('writes markdown report to reportPath', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('notes/a.md', 'Some content')
    const res = (await getHandler(
      server,
      'audit.export',
    )({
      reportPath: 'audit/report.md',
    })) as {
      structuredContent: {
        reportPath: string
        bytesWritten: number
        findings: Record<string, number>
      }
    }
    expect(res.structuredContent.reportPath).toBe('audit/report.md')
    expect(res.structuredContent.bytesWritten).toBeGreaterThan(0)
    const report = await ports.vault.readFile('audit/report.md')
    expect(report).toContain('# Vault Audit Report')
  })

  it('writes JSON baseline when baselinePath provided', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('notes/b.md', 'body')
    const res = (await getHandler(
      server,
      'audit.export',
    )({
      reportPath: 'audit/report.md',
      baselinePath: 'audit/baseline.json',
    })) as {
      structuredContent: { baselinePath: string | undefined }
    }
    expect(res.structuredContent.baselinePath).toBe('audit/baseline.json')
    const json = await ports.vault.readFile('audit/baseline.json')
    const parsed = JSON.parse(json) as { checksRun: string[] }
    expect(Array.isArray(parsed.checksRun)).toBe(true)
  })

  it('returns findings count per check', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('notes/c.md', 'body')
    const res = (await getHandler(
      server,
      'audit.export',
    )({
      reportPath: 'audit/out.md',
      checks: ['empty_notes', 'orphans'],
    })) as { structuredContent: { findings: Record<string, number> } }
    expect(typeof res.structuredContent.findings['empty_notes']).toBe('number')
    expect(typeof res.structuredContent.findings['orphans']).toBe('number')
  })

  it('gate deny → deny envelope', async () => {
    const ports = fakeModulePorts()
    ;(ports.confirmModal as unknown as { answerWith(c: 'deny'): void }).answerWith('deny')
    const gate = new PermissionGate(
      { getSettings: () => ({ ...DEFAULT_SETTINGS, defaultMode: 'ask' as const }) },
      ports.confirmModal,
    )
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerRemediationTools(server, { vault: ports.vault, metadata: ports.metadataCache, gate })
    const res = (await getHandler(
      server,
      'audit.export',
    )({
      reportPath: 'audit/report.md',
    })) as { isError: boolean }
    expect(res.isError).toBe(true)
  })

  it('rejects unsafe reportPath', async () => {
    const { server } = setup()
    const res = (await getHandler(
      server,
      'audit.export',
    )({
      reportPath: '../outside/report.md',
    })) as { isError: boolean }
    expect(res.isError).toBe(true)
  })
})
