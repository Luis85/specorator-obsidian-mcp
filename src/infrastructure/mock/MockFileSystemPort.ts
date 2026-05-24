import type { FileSystemPort } from '@/domain/ports'

/**
 * In-memory FileSystemPort for unit tests.
 * Seed initial files via the constructor or the `files` map directly.
 */
export class MockFileSystemPort implements FileSystemPort {
  readonly files: Map<string, string>
  writeCallCount = 0

  constructor(initial: Record<string, string> = {}) {
    this.files = new Map(Object.entries(initial))
  }

  async readText(path: string): Promise<string | null> {
    const content = this.files.get(path)
    return content !== undefined ? content : null
  }

  async writeText(path: string, content: string): Promise<void> {
    this.writeCallCount++
    this.files.set(path, content)
  }
}
