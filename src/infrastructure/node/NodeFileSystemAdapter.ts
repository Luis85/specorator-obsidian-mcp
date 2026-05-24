import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
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
    await fs.mkdir(dirname(path), { recursive: true })
    await fs.writeFile(path, content, 'utf8')
  }
}
