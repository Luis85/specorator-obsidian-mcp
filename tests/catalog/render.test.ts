import { describe, it, expect } from 'vitest'
import { parse as parseYaml } from 'yaml'
import { renderAsset } from '@/application/catalog/render'
import type { AssetMeta } from '@/domain/catalog/types'

const base: AssetMeta = {
  id: 'x',
  name: 'x',
  description: 'd',
  type: 'skill',
  version: '0.1.0',
  bundle: 'B',
  requires: [],
  dependsOn: [],
  body: '# Body',
}

// minimal TOML basic-string decoder for round-trip assertions
function decodeTomlBasic(s: string): string {
  return s.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

describe('renderAsset', () => {
  it('skill = SKILL.md frontmatter (yaml stringify) + body', () => {
    const out = renderAsset(base, 'claude')
    expect(out.startsWith('---\n')).toBe(true)
    expect(out).toContain('name: x')
    expect(out).toContain('description: d')
    expect(out.trim().endsWith('# Body')).toBe(true)
  })

  it('skill frontmatter round-trips through yaml even with special chars (H2)', () => {
    // colon + quote + hash would break naive `${k}: ${v}` rendering
    const tricky = { ...base, description: 'use when: "x" #1 needs care' }
    const out = renderAsset(tricky, 'claude')
    const fmText = out.slice(4, out.indexOf('\n---\n')) // between the fences
    const fm = parseYaml(fmText)
    expect(fm.description).toBe('use when: "x" #1 needs care')
    expect(fm.name).toBe('x')
  })

  it('gemini command = TOML', () => {
    const out = renderAsset({ ...base, type: 'command' }, 'gemini')
    expect(out).toContain('description = "d"')
    expect(out).toContain('prompt =')
  })

  it('gemini TOML escapes quotes/backslashes/newlines in description + prompt (H2)', () => {
    const out = renderAsset(
      {
        ...base,
        type: 'command',
        description: 'has "quote" and \\ slash',
        body: 'line1\nuse `mcp__specorator-obsidian-mcp__vault_read` and a "quote"',
      },
      'gemini',
    )
    // description is a basic string on one line — no raw newline, escaped quote/backslash
    const descLine = out.split('\n').find((l) => l.startsWith('description ='))!
    expect(descLine).toBe('description = "has \\"quote\\" and \\\\ slash"')
    // prompt is a basic (escaped) string; decode it back to the original body
    const m = /prompt = "((?:[^"\\]|\\.)*)"/s.exec(out)
    expect(m).toBeTruthy()
    expect(decodeTomlBasic(m![1])).toBe(
      'line1\nuse `mcp__specorator-obsidian-mcp__vault_read` and a "quote"',
    )
  })

  it('claude command = markdown WITH frontmatter so allowed-tools can apply (R5)', () => {
    const out = renderAsset({ ...base, type: 'command' }, 'claude')
    expect(out.startsWith('---\n')).toBe(true)
    expect(out.trim().endsWith('# Body')).toBe(true)
  })

  it('injects allowed-tools into frontmatter when provided (R5)', () => {
    const out = renderAsset(base, 'claude', 'mcp__specorator-obsidian-mcp__vault_read')
    const fmText = out.slice(4, out.indexOf('\n---\n'))
    const fm = parseYaml(fmText)
    expect(fm['allowed-tools']).toBe('mcp__specorator-obsidian-mcp__vault_read')
  })
})
