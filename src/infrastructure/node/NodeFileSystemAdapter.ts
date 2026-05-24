import { promises as fs } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { FileSystemPort } from '@/domain/ports'

export class NodeFileSystemAdapter implements FileSystemPort {
  async readText(path: string): Promise<string | null> {
    try {
      return await fs.readFile(path, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }
  }

  async writeText(path: string, content: string): Promise<void> {
    const dir = dirname(path)
    await fs.mkdir(dir, { recursive: true })
    // Symlink guard: real on-disk parent directory must resolve to where we
    // believe it to be. Protects against TOCTOU symlink-swap attacks.
    try {
      const realDir = await fs.realpath(dir)
      if (realDir !== resolve(dir)) {
        throw new Error(`refusing to write to symlinked path: ${dir} → ${realDir}`)
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      // dir was just created by mkdir — no symlink possible; carry on
    }
    // Atomic write: write to a temp file then rename into place so readers
    // never see a partial write.
    const tmp = `${path}.specorator-tmp`
    await fs.writeFile(tmp, content, 'utf8')
    await fs.rename(tmp, path)
  }
}
