import { describe, it, expect } from 'vitest'
import {
  parseFrontmatter,
  applyFrontmatterUpdate,
  joinVaultPath,
  collectFiles,
  ok,
} from '@/infrastructure/obsidian/mcp/shared'
import { fakeModulePorts } from '@@/__fakes__/fake-ports'

describe('mcp/shared', () => {
  it('parseFrontmatter returns empty object for no frontmatter', () => {
    expect(parseFrontmatter('hello world')).toEqual({})
  })

  it('parseFrontmatter parses YAML block', () => {
    expect(parseFrontmatter('---\nname: x\n---\nbody')).toEqual({ name: 'x' })
  })

  it('joinVaultPath strips trailing slash', () => {
    expect(joinVaultPath('a/', 'b.md')).toBe('a/b.md')
  })

  it('joinVaultPath with empty parent returns child', () => {
    expect(joinVaultPath('', 'b.md')).toBe('b.md')
  })

  it('ok wraps JSON for MCP content reply', () => {
    expect(ok({ x: 1 })).toEqual({ content: [{ type: 'text', text: '{"x":1}' }] })
  })

  it('applyFrontmatterUpdate merges into existing block', async () => {
    const p = fakeModulePorts()
    await p.vault.writeFile('a.md', '---\nname: x\n---\nbody')
    await applyFrontmatterUpdate(p.vault, 'a.md', { tag: 'y' })
    const content = await p.vault.readFile('a.md')
    expect(content).toContain('name: x')
    expect(content).toContain('tag: y')
    expect(content).toContain('body')
  })

  it('applyFrontmatterUpdate creates frontmatter when none exists', async () => {
    const p = fakeModulePorts()
    await p.vault.writeFile('b.md', 'just body')
    await applyFrontmatterUpdate(p.vault, 'b.md', { key: 'val' })
    const content = await p.vault.readFile('b.md')
    expect(content).toContain('key: val')
  })

  it('collectFiles recurses into subfolders', async () => {
    const p = fakeModulePorts()
    await p.vault.writeFile('notes/a.md', '')
    await p.vault.writeFile('notes/sub/b.md', '')
    const files = await collectFiles(p.vault, 'notes')
    expect(files).toContain('notes/a.md')
    expect(files).toContain('notes/sub/b.md')
  })
})
