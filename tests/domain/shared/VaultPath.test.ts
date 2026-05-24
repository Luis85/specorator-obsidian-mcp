import { describe, expect, it } from 'vitest'
import { joinVaultPath, normalizeVaultPath } from '@/domain/shared/VaultPath'

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
    '',
  ])('rejects unsafe path %s', (path) => {
    const result = normalizeVaultPath(path)

    expect(result.ok).toBe(false)
  })

  it('joins path segments through the same guardrails', () => {
    const result = joinVaultPath('specs', 'dark-mode', 'research.md')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('specs/dark-mode/research.md')
  })
})
