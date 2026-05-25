import { describe, it, expect } from 'vitest'
import { computeGraphStats, findOrphans, findDeadends } from '@/application/mcp/graph'
import { MockVaultPort } from '@/infrastructure/mock/MockVaultPort'
import { MockMetadataCachePort } from '@/infrastructure/mock/MockMetadataCachePort'

function makeDeps() {
  const vault = new MockVaultPort()
  const metadata = new MockMetadataCachePort()
  return { vault, metadata }
}

// ── computeGraphStats ────────────────────────────────────────────────────────

describe('computeGraphStats', () => {
  it('returns zeroes for empty vault', async () => {
    const { vault, metadata } = makeDeps()
    const stats = await computeGraphStats({ vault, metadata }, '')

    expect(stats.totalNotes).toBe(0)
    expect(stats.totalLinks).toBe(0)
    expect(stats.components).toBe(0)
    expect(stats.orphans).toBe(0)
    expect(stats.deadends).toBe(0)
    expect(stats.hubs).toEqual([])
    expect(stats.orphanPercent).toBe(0)
  })

  it('counts markdown files only', async () => {
    const { vault, metadata } = makeDeps()
    vault.seedFile('a.md', '# A')
    vault.seedFile('b.md', '# B')
    vault.seedFile('img.png', 'binary')

    const stats = await computeGraphStats({ vault, metadata }, '')

    expect(stats.totalNotes).toBe(2)
  })

  it('counts directed links', async () => {
    const { vault, metadata } = makeDeps()
    vault.seedFile('a.md', '# A')
    vault.seedFile('b.md', '# B')
    metadata.seedResolvedLinks('a.md', { 'b.md': 2 })

    const stats = await computeGraphStats({ vault, metadata }, '')

    expect(stats.totalLinks).toBe(2)
  })

  it('detects orphans (zero in-degree)', async () => {
    const { vault, metadata } = makeDeps()
    vault.seedFile('a.md', '# A')
    vault.seedFile('b.md', '# B')
    // b is linked from a → b has in-degree 1; a has in-degree 0 → orphan
    metadata.seedResolvedLinks('a.md', { 'b.md': 1 })

    const stats = await computeGraphStats({ vault, metadata }, '')

    expect(stats.orphans).toBe(1)
  })

  it('detects deadends (zero out-degree to other md files)', async () => {
    const { vault, metadata } = makeDeps()
    vault.seedFile('a.md', '# A')
    vault.seedFile('b.md', '# B')
    // a links to b; b has no outgoing links → b is deadend
    metadata.seedResolvedLinks('a.md', { 'b.md': 1 })

    const stats = await computeGraphStats({ vault, metadata }, '')

    expect(stats.deadends).toBe(1)
  })

  it('computes correct orphanPercent', async () => {
    const { vault, metadata } = makeDeps()
    vault.seedFile('a.md', '# A')
    vault.seedFile('b.md', '# B')
    vault.seedFile('c.md', '# C')
    vault.seedFile('d.md', '# D')
    // a, b link to d → d has backlinks; a, b, c are orphans (3 out of 4)
    metadata.seedResolvedLinks('a.md', { 'd.md': 1 })
    metadata.seedResolvedLinks('b.md', { 'd.md': 1 })

    const stats = await computeGraphStats({ vault, metadata }, '')

    // a, b, c are orphans (no in-links). d has in-links from a and b.
    expect(stats.orphans).toBe(3)
    expect(stats.orphanPercent).toBe(75)
  })

  it('identifies top-10 hubs by in-degree', async () => {
    const { vault, metadata } = makeDeps()
    // Create 12 notes; note 'hub.md' gets the most in-links
    for (let i = 0; i < 12; i++) {
      vault.seedFile(`n${i}.md`, `# N${i}`)
      metadata.seedResolvedLinks(`n${i}.md`, { 'hub.md': i + 1 })
    }
    vault.seedFile('hub.md', '# Hub')

    const stats = await computeGraphStats({ vault, metadata }, '')

    expect(stats.hubs).toHaveLength(10)
    expect(stats.hubs[0]!.path).toBe('hub.md')
  })

  it('counts connected components via union-find', async () => {
    const { vault, metadata } = makeDeps()
    // Two disconnected pairs
    vault.seedFile('a.md', '# A')
    vault.seedFile('b.md', '# B')
    vault.seedFile('c.md', '# C')
    vault.seedFile('d.md', '# D')
    metadata.seedResolvedLinks('a.md', { 'b.md': 1 })
    metadata.seedResolvedLinks('c.md', { 'd.md': 1 })

    const stats = await computeGraphStats({ vault, metadata }, '')

    expect(stats.components).toBe(2)
  })

  it('scopes to subfolder', async () => {
    const { vault, metadata } = makeDeps()
    vault.seedFile('sub/a.md', '# A')
    vault.seedFile('root.md', '# Root')

    const stats = await computeGraphStats({ vault, metadata }, 'sub')

    expect(stats.totalNotes).toBe(1)
  })
})

// ── findOrphans ──────────────────────────────────────────────────────────────

describe('findOrphans', () => {
  it('returns orphans with path, lastModified and bytes', async () => {
    const { vault, metadata } = makeDeps()
    vault.seedFile('orphan.md', '# Orphan')
    vault.seedFile('linked.md', '# Linked')
    metadata.seedBacklinks('linked.md', ['someone.md'])

    const result = await findOrphans({ vault, metadata }, '')

    expect(result.count).toBe(1)
    expect(result.orphans[0]!.path).toBe('orphan.md')
    expect(typeof result.orphans[0]!.lastModified).toBe('string')
    expect(result.orphans[0]!.bytes).toBeGreaterThan(0)
  })

  it('returns empty when no orphans', async () => {
    const { vault, metadata } = makeDeps()
    vault.seedFile('a.md', '# A')
    metadata.seedBacklinks('a.md', ['b.md'])

    const result = await findOrphans({ vault, metadata }, '')

    expect(result.count).toBe(0)
    expect(result.orphans).toEqual([])
  })

  it('filters by staleDays', async () => {
    const { vault, metadata } = makeDeps()
    vault.seedFile('old.md', '# Old orphan')
    vault.seedFile('recent.md', '# Recent orphan')

    // old.md: mtime = 20 days ago; recent.md: mtime = now
    const now = Date.now()
    vault.seedFileStats('old.md', { mtime: now - 20 * 86_400_000 })
    vault.seedFileStats('recent.md', { mtime: now })

    // staleDays=10 → only notes older than 10 days pass
    const result = await findOrphans({ vault, metadata }, '', 10)

    expect(result.count).toBe(1)
    expect(result.orphans[0]!.path).toBe('old.md')
  })

  it('returns all orphans when staleDays not set', async () => {
    const { vault, metadata } = makeDeps()
    vault.seedFile('a.md', '# A')
    vault.seedFile('b.md', '# B')

    const result = await findOrphans({ vault, metadata }, '')

    expect(result.count).toBe(2)
  })
})

// ── findDeadends ─────────────────────────────────────────────────────────────

describe('findDeadends', () => {
  it('identifies notes with zero outgoing links to other md files', async () => {
    const { vault, metadata } = makeDeps()
    vault.seedFile('dead.md', '# Dead end')
    vault.seedFile('linked.md', '# Has link')
    metadata.seedResolvedLinks('linked.md', { 'dead.md': 1 })

    const result = await findDeadends({ vault, metadata }, '')

    expect(result.count).toBe(1)
    expect(result.deadends).toContain('dead.md')
    expect(result.deadends).not.toContain('linked.md')
  })

  it('returns empty for vault with no notes', async () => {
    const { vault, metadata } = makeDeps()

    const result = await findDeadends({ vault, metadata }, '')

    expect(result.count).toBe(0)
    expect(result.deadends).toEqual([])
  })

  it('excludes links to non-md files from outgoing count', async () => {
    const { vault, metadata } = makeDeps()
    vault.seedFile('note.md', '# Note')
    // Only links to an image — not an .md file → still counts as deadend
    metadata.seedResolvedLinks('note.md', { 'image.png': 1 })

    const result = await findDeadends({ vault, metadata }, '')

    expect(result.deadends).toContain('note.md')
  })

  it('scopes to subfolder', async () => {
    const { vault, metadata } = makeDeps()
    vault.seedFile('sub/dead.md', '# Dead')
    vault.seedFile('root.md', '# Root')
    metadata.seedResolvedLinks('root.md', { 'sub/dead.md': 1 })

    const result = await findDeadends({ vault, metadata }, 'sub')

    expect(result.count).toBe(1)
    expect(result.deadends).toContain('sub/dead.md')
  })
})
