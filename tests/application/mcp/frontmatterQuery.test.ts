import { describe, it, expect } from 'vitest'
import { queryFrontmatter } from '@/application/mcp/frontmatterQuery'
import { MockVaultPort } from '@/infrastructure/mock/MockVaultPort'
import { MockMetadataCachePort } from '@/infrastructure/mock/MockMetadataCachePort'

function makeDeps() {
  const vault = new MockVaultPort()
  const metadata = new MockMetadataCachePort()
  return { vault, metadata }
}

describe('queryFrontmatter', () => {
  describe('eq operator', () => {
    it('matches notes where field equals value', async () => {
      const { vault, metadata } = makeDeps()
      vault.seedFile('a.md', '---\nstatus: done\n---')
      vault.seedFile('b.md', '---\nstatus: todo\n---')
      metadata.seedMetadata('a.md', {
        path: 'a.md',
        tags: [],
        frontmatter: { status: 'done' },
        links: [],
        embeds: [],
      })
      metadata.seedMetadata('b.md', {
        path: 'b.md',
        tags: [],
        frontmatter: { status: 'todo' },
        links: [],
        embeds: [],
      })

      const result = await queryFrontmatter(
        { vault, metadata },
        '',
        [{ field: 'status', op: 'eq', value: 'done' }],
        'AND',
      )

      expect(result.count).toBe(1)
      expect(result.matches[0]!.path).toBe('a.md')
    })
  })

  describe('neq operator', () => {
    it('excludes notes where field equals value', async () => {
      const { vault, metadata } = makeDeps()
      vault.seedFile('a.md', '')
      vault.seedFile('b.md', '')
      metadata.seedMetadata('a.md', {
        path: 'a.md',
        tags: [],
        frontmatter: { status: 'done' },
        links: [],
        embeds: [],
      })
      metadata.seedMetadata('b.md', {
        path: 'b.md',
        tags: [],
        frontmatter: { status: 'todo' },
        links: [],
        embeds: [],
      })

      const result = await queryFrontmatter(
        { vault, metadata },
        '',
        [{ field: 'status', op: 'neq', value: 'done' }],
        'AND',
      )

      expect(result.count).toBe(1)
      expect(result.matches[0]!.path).toBe('b.md')
    })
  })

  describe('contains operator', () => {
    it('matches when string field contains substring', async () => {
      const { vault, metadata } = makeDeps()
      vault.seedFile('a.md', '')
      metadata.seedMetadata('a.md', {
        path: 'a.md',
        tags: [],
        frontmatter: { title: 'My Meeting Notes' },
        links: [],
        embeds: [],
      })

      const result = await queryFrontmatter(
        { vault, metadata },
        '',
        [{ field: 'title', op: 'contains', value: 'Meeting' }],
        'AND',
      )

      expect(result.count).toBe(1)
    })

    it('matches when array field includes value', async () => {
      const { vault, metadata } = makeDeps()
      vault.seedFile('a.md', '')
      metadata.seedMetadata('a.md', {
        path: 'a.md',
        tags: [],
        frontmatter: { labels: ['work', 'urgent'] },
        links: [],
        embeds: [],
      })

      const result = await queryFrontmatter(
        { vault, metadata },
        '',
        [{ field: 'labels', op: 'contains', value: 'urgent' }],
        'AND',
      )

      expect(result.count).toBe(1)
    })
  })

  describe('in operator', () => {
    it('matches when field value is element of provided array', async () => {
      const { vault, metadata } = makeDeps()
      vault.seedFile('a.md', '')
      vault.seedFile('b.md', '')
      metadata.seedMetadata('a.md', {
        path: 'a.md',
        tags: [],
        frontmatter: { priority: 'high' },
        links: [],
        embeds: [],
      })
      metadata.seedMetadata('b.md', {
        path: 'b.md',
        tags: [],
        frontmatter: { priority: 'low' },
        links: [],
        embeds: [],
      })

      const result = await queryFrontmatter(
        { vault, metadata },
        '',
        [{ field: 'priority', op: 'in', value: ['high', 'critical'] }],
        'AND',
      )

      expect(result.count).toBe(1)
      expect(result.matches[0]!.path).toBe('a.md')
    })
  })

  describe('exists operator', () => {
    it('matches notes that have the field', async () => {
      const { vault, metadata } = makeDeps()
      vault.seedFile('a.md', '')
      vault.seedFile('b.md', '')
      metadata.seedMetadata('a.md', {
        path: 'a.md',
        tags: [],
        frontmatter: { due: '2024-01-01' },
        links: [],
        embeds: [],
      })
      metadata.seedMetadata('b.md', {
        path: 'b.md',
        tags: [],
        frontmatter: {},
        links: [],
        embeds: [],
      })

      const result = await queryFrontmatter(
        { vault, metadata },
        '',
        [{ field: 'due', op: 'exists' }],
        'AND',
      )

      expect(result.count).toBe(1)
      expect(result.matches[0]!.path).toBe('a.md')
    })
  })

  describe('gt / lt operators', () => {
    it('matches notes with numeric field greater than value', async () => {
      const { vault, metadata } = makeDeps()
      vault.seedFile('high.md', '')
      vault.seedFile('low.md', '')
      metadata.seedMetadata('high.md', {
        path: 'high.md',
        tags: [],
        frontmatter: { score: 90 },
        links: [],
        embeds: [],
      })
      metadata.seedMetadata('low.md', {
        path: 'low.md',
        tags: [],
        frontmatter: { score: 40 },
        links: [],
        embeds: [],
      })

      const result = await queryFrontmatter(
        { vault, metadata },
        '',
        [{ field: 'score', op: 'gt', value: 50 }],
        'AND',
      )

      expect(result.count).toBe(1)
      expect(result.matches[0]!.path).toBe('high.md')
    })

    it('matches notes with numeric field less than value', async () => {
      const { vault, metadata } = makeDeps()
      vault.seedFile('low.md', '')
      metadata.seedMetadata('low.md', {
        path: 'low.md',
        tags: [],
        frontmatter: { score: 20 },
        links: [],
        embeds: [],
      })

      const result = await queryFrontmatter(
        { vault, metadata },
        '',
        [{ field: 'score', op: 'lt', value: 50 }],
        'AND',
      )

      expect(result.count).toBe(1)
    })

    it('returns false for non-numeric sides', async () => {
      const { vault, metadata } = makeDeps()
      vault.seedFile('a.md', '')
      metadata.seedMetadata('a.md', {
        path: 'a.md',
        tags: [],
        frontmatter: { score: 'high' },
        links: [],
        embeds: [],
      })

      const result = await queryFrontmatter(
        { vault, metadata },
        '',
        [{ field: 'score', op: 'gt', value: 50 }],
        'AND',
      )

      expect(result.count).toBe(0)
    })
  })

  describe('AND / OR combinator', () => {
    it('AND requires all conditions to pass', async () => {
      const { vault, metadata } = makeDeps()
      vault.seedFile('a.md', '')
      vault.seedFile('b.md', '')
      metadata.seedMetadata('a.md', {
        path: 'a.md',
        tags: [],
        frontmatter: { status: 'done', priority: 'high' },
        links: [],
        embeds: [],
      })
      metadata.seedMetadata('b.md', {
        path: 'b.md',
        tags: [],
        frontmatter: { status: 'done', priority: 'low' },
        links: [],
        embeds: [],
      })

      const result = await queryFrontmatter(
        { vault, metadata },
        '',
        [
          { field: 'status', op: 'eq', value: 'done' },
          { field: 'priority', op: 'eq', value: 'high' },
        ],
        'AND',
      )

      expect(result.count).toBe(1)
      expect(result.matches[0]!.path).toBe('a.md')
    })

    it('OR requires at least one condition to pass', async () => {
      const { vault, metadata } = makeDeps()
      vault.seedFile('a.md', '')
      vault.seedFile('b.md', '')
      vault.seedFile('c.md', '')
      metadata.seedMetadata('a.md', {
        path: 'a.md',
        tags: [],
        frontmatter: { status: 'done' },
        links: [],
        embeds: [],
      })
      metadata.seedMetadata('b.md', {
        path: 'b.md',
        tags: [],
        frontmatter: { priority: 'high' },
        links: [],
        embeds: [],
      })
      metadata.seedMetadata('c.md', {
        path: 'c.md',
        tags: [],
        frontmatter: { other: 'x' },
        links: [],
        embeds: [],
      })

      const result = await queryFrontmatter(
        { vault, metadata },
        '',
        [
          { field: 'status', op: 'eq', value: 'done' },
          { field: 'priority', op: 'eq', value: 'high' },
        ],
        'OR',
      )

      expect(result.count).toBe(2)
    })
  })

  describe('empty vault', () => {
    it('returns empty matches for empty vault', async () => {
      const { vault, metadata } = makeDeps()

      const result = await queryFrontmatter(
        { vault, metadata },
        '',
        [{ field: 'status', op: 'exists' }],
        'AND',
      )

      expect(result.count).toBe(0)
      expect(result.matches).toEqual([])
    })
  })

  describe('no metadata cached', () => {
    it('treats notes with no cache entry as having empty frontmatter', async () => {
      const { vault, metadata } = makeDeps()
      vault.seedFile('no-cache.md', '# No frontmatter')
      // No seedMetadata call → metadata.getFileMetadata returns null

      const result = await queryFrontmatter(
        { vault, metadata },
        '',
        [{ field: 'status', op: 'exists' }],
        'AND',
      )

      expect(result.count).toBe(0)
    })
  })
})
