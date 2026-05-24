import type { VaultPort } from '@/domain/ports'

function folderPrefix(parent: string): string {
  if (parent === '') return ''
  return parent.endsWith('/') ? parent : `${parent}/`
}

/**
 * In-memory {@link VaultPort} for unit tests and standalone dev mode.
 */
export class MockVaultPort implements VaultPort {
  private readonly files = new Map<string, string>()
  private readonly folders = new Set<string>()

  constructor(initialFiles: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initialFiles)) {
      this.files.set(path, content)
      const parts = path.split('/')
      for (let i = 1; i < parts.length; i++) {
        this.folders.add(parts.slice(0, i).join('/'))
      }
    }
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path)
    if (content === undefined) throw new Error(`[MockVaultPort] File not found: ${path}`)
    return content
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content)
  }

  async deleteFile(path: string): Promise<void> {
    this.files.delete(path)
  }

  async listFiles(folder: string): Promise<string[]> {
    if (folder === '') {
      return [...this.files.keys()].filter((p) => !p.includes('/'))
    }
    const prefix = folder.endsWith('/') ? folder : `${folder}/`
    return [...this.files.keys()].filter((p) => {
      if (!p.startsWith(prefix)) return false
      return !p.slice(prefix.length).includes('/')
    })
  }

  async listFolders(parent: string): Promise<string[]> {
    const prefix = folderPrefix(parent)
    const names = new Set<string>()
    for (const folder of this.folders) {
      if (folder.startsWith(prefix)) {
        const rest = folder.slice(prefix.length)
        if (rest && !rest.includes('/')) names.add(rest)
      }
    }
    for (const path of this.files.keys()) {
      if (!prefix || path.startsWith(prefix)) {
        const rest = path.slice(prefix.length)
        const firstSegment = rest.split('/')[0]
        if (firstSegment && rest.includes('/')) names.add(firstSegment)
      }
    }
    return [...names]
  }

  async fileExists(path: string): Promise<boolean> {
    return this.files.has(path)
  }

  async createFolder(path: string): Promise<void> {
    this.folders.add(path)
  }

  /** Test helper: get all files as a plain object. */
  getAllFiles(): Record<string, string> {
    return Object.fromEntries(this.files)
  }

  /** Test helper: seed a file. */
  seedFile(path: string, content: string): void {
    this.files.set(path, content)
    const parts = path.split('/')
    for (let i = 1; i < parts.length; i++) {
      this.folders.add(parts.slice(0, i).join('/'))
    }
  }
}
