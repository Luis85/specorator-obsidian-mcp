import { describe, it, expect } from 'vitest'
import { auditVault, ALL_CHECKS } from '@/application/mcp/audit'
import { MockVaultPort } from '@/infrastructure/mock/MockVaultPort'
import { MockMetadataCachePort } from '@/infrastructure/mock/MockMetadataCachePort'

function makeDeps() {
  const vault = new MockVaultPort()
  const metadata = new MockMetadataCachePort()
  return { vault, metadata }
}

describe('auditVault', () => {
  describe('orphans check', () => {
    it('identifies notes with zero backlinks as orphans', async () => {
      const { vault, metadata } = makeDeps()
      vault.seedFile('a.md', '# A')
      vault.seedFile('b.md', '# B')
      vault.seedFile('c.md', '# C')
      // only b has backlinks; a and c are orphans
      metadata.seedBacklinks('b.md', ['a.md'])

      const result = await auditVault({ vault, metadata }, '', ['orphans'], 1_000_000)

      expect(result.findings.orphans).toContain('a.md')
      expect(result.findings.orphans).toContain('c.md')
      expect(result.findings.orphans).not.toContain('b.md')
      expect(result.counts['orphans']).toBe(2)
    })

    it('returns empty orphans when every note has backlinks', async () => {
      const { vault, metadata } = makeDeps()
      vault.seedFile('x.md', '# X')
      metadata.seedBacklinks('x.md', ['other.md'])

      const result = await auditVault({ vault, metadata }, '', ['orphans'], 1_000_000)

      expect(result.findings.orphans).toEqual([])
      expect(result.counts['orphans']).toBe(0)
    })
  })

  describe('deadends check', () => {
    it('identifies notes with no outgoing resolved links as dead-ends', async () => {
      const { vault, metadata } = makeDeps()
      vault.seedFile('dead.md', '# Dead end')
      vault.seedFile('linked.md', '# Has link')
      metadata.seedResolvedLinks('linked.md', { 'target.md': 1 })
      // dead.md has no resolved links — seedResolvedLinks never called

      const result = await auditVault({ vault, metadata }, '', ['deadends'], 1_000_000)

      expect(result.findings.deadends).toContain('dead.md')
      expect(result.findings.deadends).not.toContain('linked.md')
      expect(result.counts['deadends']).toBe(1)
    })
  })

  describe('unresolved_links check', () => {
    it('reports links whose target cannot be resolved', async () => {
      const { vault, metadata } = makeDeps()
      vault.seedFile('src.md', '# Source')
      metadata.seedMetadata('src.md', {
        path: 'src.md',
        tags: [],
        frontmatter: {},
        links: ['Existing', 'Missing'],
        embeds: [],
      })
      // 'Existing' resolves; 'Missing' does not
      metadata.seedLinkpathDest('Existing', 'src.md', 'existing.md')

      const result = await auditVault({ vault, metadata }, '', ['unresolved_links'], 1_000_000)

      expect(result.findings.unresolved_links).toHaveLength(1)
      expect(result.findings.unresolved_links![0]).toEqual({ source: 'src.md', target: 'Missing' })
      expect(result.counts['unresolved_links']).toBe(1)
    })

    it('returns empty list when all links resolve', async () => {
      const { vault, metadata } = makeDeps()
      vault.seedFile('note.md', '# Note')
      metadata.seedMetadata('note.md', {
        path: 'note.md',
        tags: [],
        frontmatter: {},
        links: ['Target'],
        embeds: [],
      })
      metadata.seedLinkpathDest('Target', 'note.md', 'target.md')

      const result = await auditVault({ vault, metadata }, '', ['unresolved_links'], 1_000_000)

      expect(result.findings.unresolved_links).toEqual([])
      expect(result.counts['unresolved_links']).toBe(0)
    })
  })

  describe('empty_notes check', () => {
    it('flags notes with body shorter than threshold as empty', async () => {
      const { vault, metadata } = makeDeps()
      vault.seedFile('empty.md', '---\ntitle: Empty\n---\n')
      vault.seedFile('full.md', '---\ntitle: Full\n---\n' + 'x'.repeat(100))

      const result = await auditVault({ vault, metadata }, '', ['empty_notes'], 1_000_000)

      expect(result.findings.empty_notes).toContain('empty.md')
      expect(result.findings.empty_notes).not.toContain('full.md')
    })
  })

  describe('large_files check', () => {
    it('flags files exceeding the size threshold', async () => {
      const { vault, metadata } = makeDeps()
      const big = 'x'.repeat(2000)
      vault.seedFile('big.md', big)
      vault.seedFile('small.md', 'tiny')

      const result = await auditVault({ vault, metadata }, '', ['large_files'], 1024)

      expect(result.findings.large_files?.map((f) => f.path)).toContain('big.md')
      expect(result.findings.large_files?.map((f) => f.path)).not.toContain('small.md')
      expect(result.counts['large_files']).toBe(1)
    })

    it('returns empty large_files when nothing exceeds threshold', async () => {
      const { vault, metadata } = makeDeps()
      vault.seedFile('tiny.md', 'hi')

      const result = await auditVault({ vault, metadata }, '', ['large_files'], 1_000_000)

      expect(result.findings.large_files).toEqual([])
      expect(result.counts['large_files']).toBe(0)
    })
  })

  describe('tag_dupes check', () => {
    it('detects case-insensitive tag collisions', async () => {
      const { vault, metadata } = makeDeps()
      vault.seedFile('a.md', '# A')
      vault.seedFile('b.md', '# B')
      metadata.seedMetadata('a.md', {
        path: 'a.md',
        tags: ['#Project'],
        frontmatter: {},
        links: [],
        embeds: [],
      })
      metadata.seedMetadata('b.md', {
        path: 'b.md',
        tags: ['#project'],
        frontmatter: {},
        links: [],
        embeds: [],
      })

      const result = await auditVault({ vault, metadata }, '', ['tag_dupes'], 1_000_000)

      expect(result.findings.tag_dupes).toHaveLength(1)
      expect(result.findings.tag_dupes![0]!.canonical).toBe('#project')
      expect(result.findings.tag_dupes![0]!.variants).toEqual(
        expect.arrayContaining(['#Project', '#project']),
      )
      expect(result.counts['tag_dupes']).toBe(1)
    })

    it('returns empty when no tag case collisions exist', async () => {
      const { vault, metadata } = makeDeps()
      vault.seedFile('note.md', '# Note')
      metadata.seedMetadata('note.md', {
        path: 'note.md',
        tags: ['#todo', '#done'],
        frontmatter: {},
        links: [],
        embeds: [],
      })

      const result = await auditVault({ vault, metadata }, '', ['tag_dupes'], 1_000_000)

      expect(result.findings.tag_dupes).toEqual([])
      expect(result.counts['tag_dupes']).toBe(0)
    })
  })

  describe('checks filter', () => {
    it('only runs requested checks and omits others from findings', async () => {
      const { vault, metadata } = makeDeps()
      vault.seedFile('note.md', '# Note')

      const result = await auditVault({ vault, metadata }, '', ['orphans'], 1_000_000)

      expect(result.findings.orphans).toBeDefined()
      expect(result.findings.deadends).toBeUndefined()
      expect(result.findings.unresolved_links).toBeUndefined()
      expect(result.checksRun).toEqual(['orphans'])
    })

    it('runs all checks when ALL_CHECKS is passed', async () => {
      const { vault, metadata } = makeDeps()
      vault.seedFile('note.md', '# Note')

      const result = await auditVault({ vault, metadata }, '', ALL_CHECKS, 1_000_000)

      expect(result.checksRun).toHaveLength(ALL_CHECKS.length)
      expect(result.findings.orphans).toBeDefined()
      expect(result.findings.deadends).toBeDefined()
      expect(result.findings.unresolved_links).toBeDefined()
      expect(result.findings.empty_notes).toBeDefined()
      expect(result.findings.large_files).toBeDefined()
      expect(result.findings.tag_dupes).toBeDefined()
    })
  })

  describe('metadata', () => {
    it('reports correct totalFiles count (only .md files)', async () => {
      const { vault, metadata } = makeDeps()
      vault.seedFile('a.md', '# A')
      vault.seedFile('b.md', '# B')
      vault.seedFile('image.png', 'binary')

      const result = await auditVault({ vault, metadata }, '', ['orphans'], 1_000_000)

      expect(result.totalFiles).toBe(2)
    })

    it('returns the resolved folder in the result', async () => {
      const { vault, metadata } = makeDeps()
      vault.seedFile('sub/note.md', '# Note')

      const result = await auditVault({ vault, metadata }, 'sub', ['orphans'], 1_000_000)

      expect(result.folder).toBe('sub')
    })
  })
})
