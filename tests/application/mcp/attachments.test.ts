import { describe, it, expect } from 'vitest'
import { isTextFile, extractEmbeds, computeOrphans } from '@/application/mcp/attachments'

describe('isTextFile', () => {
  it('returns true for .md', () => expect(isTextFile('notes/a.md')).toBe(true))
  it('returns true for .canvas', () => expect(isTextFile('board.canvas')).toBe(true))
  it('returns true for .base', () => expect(isTextFile('data.base')).toBe(true))
  it('returns false for .png', () => expect(isTextFile('image.png')).toBe(false))
  it('returns false for .jpg', () => expect(isTextFile('photo.jpg')).toBe(false))
  it('returns false for .pdf', () => expect(isTextFile('doc.pdf')).toBe(false))
  it('is case-insensitive for extension', () => {
    expect(isTextFile('file.MD')).toBe(true)
    expect(isTextFile('file.PNG')).toBe(false)
  })
})

describe('extractEmbeds', () => {
  it('extracts wikilink embeds ![[file]]', () => {
    const content = '![[image.png]]'
    const refs = extractEmbeds(content)
    expect(refs.has('image.png')).toBe(true)
  })

  it('extracts wikilink embeds with alias ![[file|alias]]', () => {
    const content = '![[photo.jpg|My Photo]]'
    const refs = extractEmbeds(content)
    expect(refs.has('photo.jpg')).toBe(true)
  })

  it('extracts wikilink embeds with path ![[path/to/file.png]]', () => {
    const content = '![[assets/diagram.svg]]'
    const refs = extractEmbeds(content)
    expect(refs.has('assets/diagram.svg')).toBe(true)
  })

  it('extracts markdown embeds ![alt](path)', () => {
    const content = '![My image](assets/photo.png)'
    const refs = extractEmbeds(content)
    expect(refs.has('assets/photo.png')).toBe(true)
  })

  it('extracts multiple embeds', () => {
    const content = '![[a.png]] and ![[b.svg]] and ![alt](c.jpg)'
    const refs = extractEmbeds(content)
    expect(refs.size).toBe(3)
  })

  it('returns empty set for content with no embeds', () => {
    const content = 'Just text [[regular link]] no embeds here.'
    const refs = extractEmbeds(content)
    expect(refs.size).toBe(0)
  })
})

describe('computeOrphans', () => {
  it('identifies unreferenced media file as orphan', () => {
    const allFiles = ['note.md', 'image.png']
    const contentMap = new Map([['note.md', 'Some text with no embeds.']])
    const statsMap = new Map([['image.png', 4096]])
    const orphans = computeOrphans(allFiles, contentMap, statsMap)
    expect(orphans).toHaveLength(1)
    expect(orphans[0]?.path).toBe('image.png')
    expect(orphans[0]?.bytes).toBe(4096)
  })

  it('does not flag referenced media file as orphan', () => {
    const allFiles = ['note.md', 'image.png']
    const contentMap = new Map([['note.md', '![[image.png]]']])
    const statsMap = new Map([['image.png', 100]])
    const orphans = computeOrphans(allFiles, contentMap, statsMap)
    expect(orphans).toHaveLength(0)
  })

  it('resolves by basename when reference is basename-only', () => {
    const allFiles = ['note.md', 'assets/photo.jpg']
    const contentMap = new Map([['note.md', '![[photo.jpg]]']])
    const statsMap = new Map([['assets/photo.jpg', 200]])
    const orphans = computeOrphans(allFiles, contentMap, statsMap)
    expect(orphans).toHaveLength(0)
  })

  it('does not flag text files as orphans', () => {
    const allFiles = ['note.md', 'other.canvas']
    const contentMap = new Map([
      ['note.md', 'text'],
      ['other.canvas', '{}'],
    ])
    const statsMap = new Map<string, number>()
    const orphans = computeOrphans(allFiles, contentMap, statsMap)
    // Text files (.md, .canvas) should never appear as orphans
    expect(orphans.every((o) => !o.path.endsWith('.md') && !o.path.endsWith('.canvas'))).toBe(true)
  })

  it('returns empty array when no media files', () => {
    const allFiles = ['a.md', 'b.md']
    const contentMap = new Map([
      ['a.md', ''],
      ['b.md', ''],
    ])
    const statsMap = new Map<string, number>()
    const orphans = computeOrphans(allFiles, contentMap, statsMap)
    expect(orphans).toHaveLength(0)
  })
})
