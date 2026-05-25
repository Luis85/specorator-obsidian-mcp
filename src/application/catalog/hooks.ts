import type { FileSystem } from '@/domain/catalog/types'
import { writeBackup } from './backup'

export const HOOKS_PATH = '.claude/hooks/hooks.json'

export interface HookFragment {
  id: string // specorator asset id, used to tag the entry
  event: string // e.g. "SessionStart" | "PreToolUse"
  entry: Record<string, unknown>
}

// Strict reader: a missing file is an empty object, but a present-but-malformed
// file MUST surface as an error. We never silently coerce a corrupt hooks file
// to {} because we are about to overwrite it — doing so would wipe the user's
// other hooks. Callers that overwrite (mergeHook/unmergeHook) rely on this abort.
async function readJsonStrict(fs: FileSystem, path: string): Promise<Record<string, unknown[]>> {
  const raw = await fs.read(path)
  if (raw === null || raw === '') return {}
  try {
    return JSON.parse(raw) as Record<string, unknown[]>
  } catch (e) {
    throw new Error(
      `refusing to rewrite ${path}: existing file is not valid JSON ` +
        `(${String((e as Error).message)}); ` +
        `fix or remove it manually so we don't clobber your other hooks`,
      { cause: e },
    )
  }
}

function parentDir(p: string): string {
  return p.slice(0, p.lastIndexOf('/')) || '.'
}

export async function mergeHook(fs: FileSystem, path: string, frag: HookFragment): Promise<void> {
  if (await fs.exists(path)) await writeBackup(fs, path)
  const json = await readJsonStrict(fs, path)
  if (!Array.isArray(json[frag.event])) json[frag.event] = []
  json[frag.event] = (json[frag.event] as Array<Record<string, unknown>>).filter(
    (e) => e._specorator !== frag.id,
  )
  ;(json[frag.event] as Array<Record<string, unknown>>).push({
    ...frag.entry,
    _specorator: frag.id,
  })
  await fs.mkdirp(parentDir(path))
  await fs.write(path, JSON.stringify(json, null, 2))
}

export async function unmergeHook(fs: FileSystem, path: string, id: string): Promise<void> {
  // No-op if the file was never created — never write an empty file.
  if (!(await fs.exists(path))) return
  // Read STRICTLY first (aborts on malformed JSON) so a parse failure does not
  // let us overwrite the user's hooks with {}.
  const json = await readJsonStrict(fs, path)
  // Back up the original before any rewrite, same as mergeHook.
  await writeBackup(fs, path)
  for (const event of Object.keys(json)) {
    json[event] = (json[event] as Array<Record<string, unknown>>).filter(
      (e) => e._specorator !== id,
    )
  }
  await fs.write(path, JSON.stringify(json, null, 2))
}
