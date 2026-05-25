import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { buildIndexFromDir } from '../../scripts/build-catalog'

const PHASE2_IDS = [
  'building-canvas',
  'building-moc',
  'fixing-links',
  'normalizing-frontmatter',
  'audit-vault',
  'moc-builder',
  'setup',
  'vault-librarian',
]

describe('authored bundles', () => {
  it('includes every Phase 2 asset id (commands+agents scanned too)', async () => {
    const idx = await buildIndexFromDir('catalog')
    const ids = idx.assets.map((a) => a.id)
    for (const id of PHASE2_IDS) expect(ids).toContain(id)
  })

  it('bodies use the canonical MCP prefix, never the colon form (B1/Decision 1)', async () => {
    const idx = await buildIndexFromDir('catalog')
    for (const a of idx.assets) {
      expect(a.body).not.toMatch(/specorator-obsidian-mcp:[a-z]/)
    }
  })

  it('ships an eval file with >=3 scenarios per asset (H8)', async () => {
    for (const id of PHASE2_IDS) {
      const p = `evals/${id}.jsonl`
      expect(existsSync(p)).toBe(true)
      const lines = (await readFile(p, 'utf8')).trim().split('\n').filter(Boolean)
      expect(lines.length).toBeGreaterThanOrEqual(3)
      lines.forEach((l) => {
        expect(() => JSON.parse(l)).not.toThrow()
      })
    }
  })

  it('moc-builder vs building-moc never co-trigger on the same prompt (H8)', async () => {
    const cmd = (await readFile('evals/moc-builder.jsonl', 'utf8')).trim().split('\n')
    for (const l of cmd) {
      const s = JSON.parse(l) as { expectTrigger: string; mustNotTrigger?: string[] }
      expect(s.expectTrigger).toBe('moc-builder')
      expect(s.mustNotTrigger).toContain('building-moc')
    }
  })
})
