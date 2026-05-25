import { describe, expect, it } from 'vitest'
import { joinVaultPath, normalizeVaultPath, isVaultRoot } from '@/domain/shared/VaultPath'

describe('VaultPath', () => {
  it('normalizes duplicate slashes, dot segments, and Windows separators', () => {
    const result = normalizeVaultPath(' specs\\\\dark-mode//./workflow-state.md ')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('specs/dark-mode/workflow-state.md')
  })

  it.each([
    '../outside.md',
    'specs/../outside.md',
    '/absolute.md',
    'C:\\vault\\file.md',
    '.obsidian/plugins/specorator/data.json',
  ])('rejects unsafe path %s', (path) => {
    const result = normalizeVaultPath(path)

    expect(result.ok).toBe(false)
  })

  it('joins path segments through the same guardrails', () => {
    const result = joinVaultPath('specs', 'dark-mode', 'research.md')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('specs/dark-mode/research.md')
  })

  describe('vault-root equivalents — normalizeVaultPath', () => {
    it.each(['', '.', '/', './'])('normalizeVaultPath(%j) returns ok("") — vault root', (path) => {
      const result = normalizeVaultPath(path)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toBe('')
    })

    it('normalizeVaultPath with surrounding whitespace around root-forms', () => {
      for (const raw of [' ', ' . ', ' / ', ' ./ ']) {
        const result = normalizeVaultPath(raw)
        expect(result.ok, `expected ok for "${raw}"`).toBe(true)
        if (result.ok) expect(result.value).toBe('')
      }
    })

    it('still rejects ".." (parent traversal)', () => {
      const result = normalizeVaultPath('..')
      expect(result.ok).toBe(false)
    })
  })

  describe('isVaultRoot', () => {
    it.each(['', '.', '/', './'])('isVaultRoot(%j) is true', (path) => {
      expect(isVaultRoot(path)).toBe(true)
    })

    it.each([' ', ' . ', ' / ', ' ./ '])('isVaultRoot(%j) is true after trim', (path) => {
      expect(isVaultRoot(path)).toBe(true)
    })

    it.each(['notes', 'specs/idea.md', '..', '../outside'])('isVaultRoot(%j) is false', (path) => {
      expect(isVaultRoot(path)).toBe(false)
    })
  })
})
