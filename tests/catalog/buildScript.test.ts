import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildIndexFromDir } from '../../scripts/build-catalog'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'

const execFileAsync = promisify(execFile)

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

describe('build-catalog CLI — malformed asset', () => {
  const tmpDir = 'tmp-test-catalog-malformed'
  const assetId = 'bad-asset'

  beforeEach(async () => {
    const skillDir = join(tmpDir, 'skills', assetId)
    await mkdir(skillDir, { recursive: true })
    // Missing required `type` field — parseAsset throws "invalid type"
    await writeFile(
      join(skillDir, 'SKILL.md'),
      [
        '---',
        `name: ${assetId}`,
        'description: Use when testing malformed assets.',
        'version: 0.1.0',
        '---',
        '',
        'Body content.',
      ].join('\n'),
    )
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('exits 1 and writes an error to stderr when an asset fails frontmatter validation', async () => {
    let caught: { code: number | null; stderr: string } | null = null
    try {
      await execFileAsync('node', ['--import', 'tsx/esm', 'scripts/build-catalog.ts', tmpDir], {
        env: { ...process.env },
      })
    } catch (e: unknown) {
      const err = e as { code: number | null; stderr: string }
      caught = { code: err.code, stderr: err.stderr }
    }
    expect(caught, 'process should have exited non-zero').not.toBeNull()
    expect(caught!.code).toBe(1)
    expect(caught!.stderr).toContain('build-catalog error:')
  })
})
