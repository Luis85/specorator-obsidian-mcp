import { describe, it, expect } from 'vitest'
import { matchGlob } from '@/domain/shared/matchGlob'

describe('matchGlob', () => {
  describe('exact match', () => {
    it('matches literal path exactly', () => {
      expect(matchGlob('notes/a.md', 'notes/a.md')).toBe(true)
    })

    it('rejects different path', () => {
      expect(matchGlob('notes/a.md', 'notes/b.md')).toBe(false)
    })
  })

  describe('single-segment wildcard *', () => {
    it('matches any filename in root', () => {
      expect(matchGlob('*.md', 'readme.md')).toBe(true)
    })

    it('does not match across path separators', () => {
      expect(matchGlob('*.md', 'folder/readme.md')).toBe(false)
    })

    it('matches partial filename', () => {
      expect(matchGlob('note*.md', 'notes.md')).toBe(true)
      expect(matchGlob('note*.md', 'note-draft.md')).toBe(true)
    })
  })

  describe('multi-segment wildcard **', () => {
    it('matches files in any subdirectory', () => {
      expect(matchGlob('**/*.md', 'a/b/c.md')).toBe(true)
      expect(matchGlob('**/*.md', 'c.md')).toBe(true)
    })

    it('does not match wrong extension', () => {
      expect(matchGlob('**/*.md', 'a/b/c.canvas')).toBe(false)
    })

    it('matches across many levels', () => {
      expect(matchGlob('**/*.canvas', 'a/b/c/d/e.canvas')).toBe(true)
    })
  })

  describe('prefix pattern with **/', () => {
    it('matches files under a known prefix', () => {
      expect(matchGlob('notes/**/*.md', 'notes/sub/file.md')).toBe(true)
    })

    it('rejects file outside the prefix', () => {
      expect(matchGlob('notes/**/*.md', 'other/sub/file.md')).toBe(false)
    })
  })

  describe('special regex characters in pattern', () => {
    it('treats . as a literal dot', () => {
      expect(matchGlob('file.md', 'fileXmd')).toBe(false)
      expect(matchGlob('file.md', 'file.md')).toBe(true)
    })

    it('treats + as literal plus', () => {
      expect(matchGlob('c++.md', 'c++.md')).toBe(true)
      expect(matchGlob('c++.md', 'c.md')).toBe(false)
    })
  })

  describe('empty pattern', () => {
    it('only matches empty string', () => {
      expect(matchGlob('', '')).toBe(true)
      expect(matchGlob('', 'anything')).toBe(false)
    })
  })
})
