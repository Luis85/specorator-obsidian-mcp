import { type App, normalizePath } from 'obsidian'
import type { FileSystem } from '@/domain/catalog/types'

export function obsidianFs(app: App): FileSystem {
  const a = app.vault.adapter
  return {
    async read(p) {
      const n = normalizePath(p)
      return (await a.exists(n)) ? a.read(n) : null
    },
    async write(p, c) {
      await a.write(normalizePath(p), c)
    },
    // WS-Z2 Fix 5: Obsidian's vault adapter does not expose a native append.
    // We fall back to a synchronous read+write under the Obsidian single-process
    // guarantee — the vault adapter serialises all I/O so there is no
    // cross-process race here; only in-process concurrent awaits could race, but
    // the installer's sequential asset loop makes that impossible in practice.
    // not race-safe but Obsidian vault is single-process
    async append(p, c) {
      const n = normalizePath(p)
      const prev = (await a.exists(n)) ? await a.read(n) : ''
      await a.write(n, prev + c)
    },
    async exists(p) {
      return a.exists(normalizePath(p))
    },
    async remove(p) {
      const n = normalizePath(p)
      if (await a.exists(n)) await a.remove(n)
    },
    // Recursive mkdir: app.vault.adapter.mkdir does NOT create intermediate
    // dirs, so walk each ancestor segment and create the missing ones. Needed
    // for nested targets like `.claude/skills/<id>/`.
    async mkdirp(p) {
      const parts = normalizePath(p).split('/').filter(Boolean)
      let cur = ''
      for (const part of parts) {
        cur = cur ? `${cur}/${part}` : part
        if (!(await a.exists(cur))) await a.mkdir(cur)
      }
    },
  }
}
