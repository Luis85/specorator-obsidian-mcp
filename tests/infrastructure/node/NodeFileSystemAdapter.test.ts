import { describe, it, expect, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { NodeFileSystemAdapter } from '@/infrastructure/node/NodeFileSystemAdapter'

/** Create a unique temp directory for each test run and clean up after. */
async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'specorator-test-'))
  try {
    await fn(dir)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

describe('NodeFileSystemAdapter', () => {
  describe('readText', () => {
    it('returns null for a missing file', async () => {
      await withTempDir(async (dir) => {
        const adapter = new NodeFileSystemAdapter()
        const result = await adapter.readText(join(dir, 'nonexistent.txt'))
        expect(result).toBeNull()
      })
    })

    it('returns file content', async () => {
      await withTempDir(async (dir) => {
        const adapter = new NodeFileSystemAdapter()
        const filePath = join(dir, 'hello.txt')
        await fs.writeFile(filePath, 'world', 'utf8')
        const result = await adapter.readText(filePath)
        expect(result).toBe('world')
      })
    })
  })

  describe('writeText — atomic writes', () => {
    it('writes content and round-trips through readText', async () => {
      await withTempDir(async (dir) => {
        const adapter = new NodeFileSystemAdapter()
        const filePath = join(dir, 'out.txt')
        await adapter.writeText(filePath, 'hello atomic')
        const content = await fs.readFile(filePath, 'utf8')
        expect(content).toBe('hello atomic')
      })
    })

    it('second write succeeds and overwrites the first', async () => {
      await withTempDir(async (dir) => {
        const adapter = new NodeFileSystemAdapter()
        const filePath = join(dir, 'out.txt')
        await adapter.writeText(filePath, 'first')
        await adapter.writeText(filePath, 'second')
        const content = await fs.readFile(filePath, 'utf8')
        expect(content).toBe('second')
      })
    })

    it('creates intermediate directories', async () => {
      await withTempDir(async (dir) => {
        const adapter = new NodeFileSystemAdapter()
        const filePath = join(dir, 'a', 'b', 'c.txt')
        await adapter.writeText(filePath, 'nested')
        const content = await fs.readFile(filePath, 'utf8')
        expect(content).toBe('nested')
      })
    })

    it('does not leave a .specorator-tmp file behind after a successful write', async () => {
      await withTempDir(async (dir) => {
        const adapter = new NodeFileSystemAdapter()
        const filePath = join(dir, 'out.txt')
        await adapter.writeText(filePath, 'atomic content')
        const tmpPath = `${filePath}.specorator-tmp`
        await expect(fs.access(tmpPath)).rejects.toThrow()
      })
    })
  })
})
