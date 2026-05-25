import { describe, it, expect } from 'vitest'
import { buildIndexFromDir } from '../../scripts/build-catalog'

describe('buildIndexFromDir', () => {
  it('builds an index containing the authored skill', async () => {
    const idx = await buildIndexFromDir('catalog')
    expect(idx.assets.some((a) => a.id === 'auditing-vault')).toBe(true)
  })

  it('uses fully-qualified mcp__ tool names in the bundled skill body', async () => {
    const idx = await buildIndexFromDir('catalog')
    const skill = idx.assets.find((a) => a.id === 'auditing-vault')!
    expect(skill.body).toContain('mcp__specorator-obsidian-mcp__vault_list')
    expect(skill.body).not.toMatch(/specorator-obsidian-mcp:[a-z]/) // no colon form
  })
})
