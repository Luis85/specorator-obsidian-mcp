import { readdir, readFile, writeFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAsset } from '../src/application/catalog/frontmatter'
import type { CatalogIndex } from '../src/domain/catalog/types'

// SINGLE SOURCE OF TRUTH for the catalog scan (R1). Phase 2 appends
// commands/agents and Phase 3 appends hooks — each adds ONE row here; do NOT
// create a second build script (`.mjs`). Every asset is routed through
// `parseAsset`, so the frontmatter validator gates EVERY asset type.
// SINGLE SOURCE OF TRUTH for the catalog scan (R1). Phase 3 appends hooks —
// adds ONE row here; do NOT create a second build script (`.mjs`). Every asset
// is routed through `parseAsset`, so the frontmatter validator gates EVERY asset type.
export const SOURCES: { subdir: string; file: string }[] = [
  { subdir: 'skills', file: 'SKILL.md' },
  { subdir: 'commands', file: 'command.md' }, // Decision 3
  { subdir: 'agents', file: 'agent.md' }, // Decision 3
  { subdir: 'hooks', file: 'hook.md' }, // Phase 3
]

async function dirExists(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory()
  } catch {
    return false
  }
}

export async function buildIndexFromDir(root: string): Promise<CatalogIndex> {
  const assets = []
  for (const { subdir, file } of SOURCES) {
    const dir = join(root, subdir)
    if (!(await dirExists(dir))) continue // tolerate not-yet-created dirs
    for (const id of await readdir(dir)) {
      const raw = await readFile(join(dir, id, file), 'utf8')
      assets.push(parseAsset(id, raw)) // validates name/description/gerund/etc.
    }
  }
  return { version: '0.1.0', assets }
}

// CLI entry: `tsx scripts/build-catalog.ts`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const idx = await buildIndexFromDir('catalog')
  await writeFile('catalog/index.json', JSON.stringify(idx, null, 2))
  console.log(`built catalog/index.json (${idx.assets.length} assets)`)
}
