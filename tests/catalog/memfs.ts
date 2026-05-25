import type { FileSystem } from '@/domain/catalog/types'

export interface MemFs extends FileSystem {
  dump(): Record<string, string>
  dirs(): string[]
  /** Make write(path) throw once — used to simulate a mid-asset platform failure. */
  failOn(path: string): void
}

function ancestors(p: string): string[] {
  const parts = p.split('/').slice(0, -1)
  const out: string[] = []
  let cur = ''
  for (const part of parts) {
    cur = cur ? `${cur}/${part}` : part
    out.push(cur)
  }
  return out
}

export function memFs(seed: Record<string, string> = {}): MemFs {
  const store = new Map<string, string>(Object.entries(seed))
  const dirSet = new Set<string>()
  for (const f of store.keys()) for (const d of ancestors(f)) dirSet.add(d)
  const failPaths = new Set<string>()

  return {
    async read(p) {
      return store.has(p) ? store.get(p)! : null
    },
    async write(p, c) {
      if (failPaths.has(p)) {
        failPaths.delete(p)
        throw new Error(`simulated write failure: ${p}`)
      }
      store.set(p, c)
      for (const d of ancestors(p)) dirSet.add(d)
    },
    // WS-Z2 Fix 5: in-memory append — concatenate to existing content (or create).
    async append(p, c) {
      const prev = store.get(p) ?? ''
      store.set(p, prev + c)
      for (const d of ancestors(p)) dirSet.add(d)
    },
    async exists(p) {
      return store.has(p) || dirSet.has(p)
    },
    async remove(p) {
      store.delete(p)
      dirSet.delete(p)
    },
    async mkdirp(p) {
      for (const d of ancestors(p + '/_')) dirSet.add(d)
    },
    dump: () => Object.fromEntries(store),
    dirs: () => [...dirSet],
    failOn: (p) => failPaths.add(p),
  }
}
