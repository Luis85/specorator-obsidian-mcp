import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerVaultTools } from '@/infrastructure/obsidian/mcp/registerVaultTools'
import { PermissionGate } from '@/application/mcp/PermissionGate'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
import { fakeModulePorts } from '@@/__fakes__/fake-ports'
import { makeAllowGate, getHandler, getRegisteredTools } from '@@/__fakes__/gate-helpers'

const vaultWriteContentSchema = z.string().max(10_000_000)

function setup() {
  const ports = fakeModulePorts()
  const gate = makeAllowGate(ports.confirmModal)
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  registerVaultTools(server, { vault: ports.vault, gate })
  return { server, ports }
}

describe('registerVaultTools', () => {
  it('registers exactly the canonical vault tools (per DEFAULT_TOOL_MODES)', () => {
    const { server } = setup()
    const tools = getRegisteredTools(server)
    const expected = Object.keys(DEFAULT_SETTINGS.toolModes)
      .filter((k) => k.startsWith('vault.'))
      .sort()
    expect(Object.keys(tools).sort()).toEqual(expected)
  })

  it('vault.write mutates vault directly (no proposal queue)', async () => {
    const { server, ports } = setup()
    await getHandler(server, 'vault.write')({ path: 'a.md', content: 'hi' })
    expect(await ports.vault.readFile('a.md')).toBe('hi')
  })

  it('vault.read returns file content', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('b.md', 'hello')
    const result = (await getHandler(server, 'vault.read')({ path: 'b.md' })) as {
      content: [{ text: string }]
    }
    expect(JSON.parse(result.content[0].text)).toEqual({ content: 'hello' })
  })

  it('vault.exists returns true for existing file', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('c.md', '')
    const result = (await getHandler(server, 'vault.exists')({ path: 'c.md' })) as {
      content: [{ text: string }]
    }
    expect(JSON.parse(result.content[0].text)).toEqual({ exists: true })
  })

  it('vault.exists returns false for missing file', async () => {
    const { server } = setup()
    const result = (await getHandler(server, 'vault.exists')({ path: 'missing.md' })) as {
      content: [{ text: string }]
    }
    expect(JSON.parse(result.content[0].text)).toEqual({ exists: false })
  })

  it('vault.delete removes file from vault', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('del.md', 'bye')
    await getHandler(server, 'vault.delete')({ path: 'del.md' })
    expect(await ports.vault.fileExists('del.md')).toBe(false)
  })

  it('vault.move copies content to new path and removes old', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('old.md', 'content')
    await getHandler(server, 'vault.move')({ from: 'old.md', to: 'new.md' })
    expect(await ports.vault.readFile('new.md')).toBe('content')
    expect(await ports.vault.fileExists('old.md')).toBe(false)
  })

  it('vault.createFolder creates a folder', async () => {
    const { server, ports } = setup()
    await getHandler(server, 'vault.createFolder')({ path: 'myfolder' })
    const folders = await ports.vault.listFolders('')
    expect(folders).toContain('myfolder')
  })

  it('vault.list returns files and subfolders', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('docs/a.md', '')
    await ports.vault.writeFile('docs/sub/b.md', '')
    const result = (await getHandler(server, 'vault.list')({ folder: 'docs' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as { files: string[]; folders: string[] }
    expect(parsed.files).toContain('docs/a.md')
    expect(parsed.folders).toContain('docs/sub')
  })

  it('vault.write returns deny envelope when gate denies', async () => {
    const ports = fakeModulePorts()
    ;(
      ports.confirmModal as unknown as {
        answerWith: (c: 'allow' | 'allow-session' | 'deny') => void
      }
    ).answerWith('deny')
    const gate = new PermissionGate(
      { getSettings: () => ({ ...DEFAULT_SETTINGS, defaultMode: 'ask' as const }) },
      ports.confirmModal,
    )
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerVaultTools(server, { vault: ports.vault, gate })
    const res = (await getHandler(server, 'vault.write')({ path: 'a.md', content: 'hi' })) as {
      isError: boolean
    }
    expect(res.isError).toBe(true)
    expect(await ports.vault.fileExists('a.md')).toBe(false)
  })

  it('vault.move returns deny envelope when to falls inside a denied path', async () => {
    const ports = fakeModulePorts()
    const gate = new PermissionGate(
      {
        getSettings: () => ({
          ...DEFAULT_SETTINGS,
          defaultMode: 'allow' as const,
          pathDenyList: ['.obsidian/**'],
          toolModes: {
            ...DEFAULT_SETTINGS.toolModes,
            'vault.move': 'allow' as const,
          },
        }),
      },
      ports.confirmModal,
    )
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerVaultTools(server, { vault: ports.vault, gate })
    await ports.vault.writeFile('notes/a.md', 'content')
    const res = (await getHandler(
      server,
      'vault.move',
    )({
      from: 'notes/a.md',
      to: '.obsidian/community-plugins.json',
    })) as { isError: boolean }
    expect(res.isError).toBe(true)
    expect(await ports.vault.fileExists('notes/a.md')).toBe(true)
  })

  it('vault.write writes when gate allows', async () => {
    const ports = fakeModulePorts()
    ;(
      ports.confirmModal as unknown as {
        answerWith: (c: 'allow' | 'allow-session' | 'deny') => void
      }
    ).answerWith('allow')
    const gate = new PermissionGate(
      { getSettings: () => ({ ...DEFAULT_SETTINGS, defaultMode: 'ask' as const }) },
      ports.confirmModal,
    )
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerVaultTools(server, { vault: ports.vault, gate })
    await getHandler(server, 'vault.write')({ path: 'a.md', content: 'hi' })
    expect(await ports.vault.readFile('a.md')).toBe('hi')
  })

  it('vault.write gate call does not include content field (modal-friendly)', async () => {
    const ports = fakeModulePorts()
    let capturedParams: Record<string, unknown> | undefined
    const spyGate = {
      resolve: async (
        _toolName: string,
        params: Record<string, unknown>,
      ): Promise<{ decision: 'allow'; reason: string }> => {
        capturedParams = params
        return { decision: 'allow', reason: 'test' }
      },
    } as unknown as PermissionGate
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerVaultTools(server, { vault: ports.vault, gate: spyGate })
    await getHandler(server, 'vault.write')({ path: 'a.md', content: 'large content here' })
    expect(capturedParams).toBeDefined()
    expect('content' in capturedParams!).toBe(false)
    expect(capturedParams!['path']).toBe('a.md')
  })

  describe('vault.search', () => {
    it('returns matches for query string', async () => {
      const { server, ports } = setup()
      await ports.vault.writeFile('notes/a.md', 'Hello world, this is a test note.')
      await ports.vault.writeFile('notes/b.md', 'Nothing interesting here.')
      const result = (await getHandler(
        server,
        'vault.search',
      )({
        query: 'Hello',
      })) as { content: [{ text: string }] }
      const parsed = JSON.parse(result.content[0].text) as {
        matches: Array<{ path: string; excerpt: string }>
      }
      expect(parsed.matches).toHaveLength(1)
      expect(parsed.matches[0]!.path).toBe('notes/a.md')
      expect(parsed.matches[0]!.excerpt).toContain('Hello')
    })

    it('is case-insensitive', async () => {
      const { server, ports } = setup()
      await ports.vault.writeFile('doc.md', 'The QUICK brown fox.')
      const result = (await getHandler(
        server,
        'vault.search',
      )({
        query: 'quick',
      })) as { content: [{ text: string }] }
      const parsed = JSON.parse(result.content[0].text) as {
        matches: Array<{ path: string; excerpt: string }>
      }
      expect(parsed.matches).toHaveLength(1)
    })

    it('scopes to folder when folder param provided', async () => {
      const { server, ports } = setup()
      await ports.vault.writeFile('work/task.md', 'important task here')
      await ports.vault.writeFile('personal/task.md', 'important task here')
      const result = (await getHandler(
        server,
        'vault.search',
      )({
        query: 'important',
        folder: 'work',
      })) as { content: [{ text: string }] }
      const parsed = JSON.parse(result.content[0].text) as {
        matches: Array<{ path: string; excerpt: string }>
      }
      expect(parsed.matches).toHaveLength(1)
      expect(parsed.matches[0]!.path).toBe('work/task.md')
    })

    it('caps results at 100', async () => {
      const { server, ports } = setup()
      for (let i = 0; i < 120; i++) {
        await ports.vault.writeFile(`n${i}.md`, 'needle content inside')
      }
      const result = (await getHandler(
        server,
        'vault.search',
      )({
        query: 'needle',
      })) as { content: [{ text: string }] }
      const parsed = JSON.parse(result.content[0].text) as {
        matches: Array<{ path: string; excerpt: string }>
      }
      expect(parsed.matches.length).toBeLessThanOrEqual(100)
    })

    it('rejects traversal in folder param', async () => {
      const { server } = setup()
      const res = (await getHandler(
        server,
        'vault.search',
      )({
        query: 'x',
        folder: '../outside',
      })) as { isError: boolean }
      expect(res.isError).toBe(true)
    })
  })

  describe('vault.list_recursive', () => {
    it('enumerates nested folders', async () => {
      const { server, ports } = setup()
      await ports.vault.writeFile('root/a.md', '')
      await ports.vault.writeFile('root/sub/b.md', '')
      await ports.vault.writeFile('root/sub/deep/c.md', '')
      const result = (await getHandler(
        server,
        'vault.list_recursive',
      )({
        folder: 'root',
      })) as { content: [{ text: string }] }
      const parsed = JSON.parse(result.content[0].text) as { files: string[] }
      expect(parsed.files).toContain('root/a.md')
      expect(parsed.files).toContain('root/sub/b.md')
      expect(parsed.files).toContain('root/sub/deep/c.md')
    })

    it('returns empty array for empty folder', async () => {
      const { server, ports } = setup()
      await ports.vault.createFolder('emptydir')
      const result = (await getHandler(
        server,
        'vault.list_recursive',
      )({
        folder: 'emptydir',
      })) as { content: [{ text: string }] }
      const parsed = JSON.parse(result.content[0].text) as { files: string[] }
      expect(parsed.files).toEqual([])
    })

    it('rejects absolute path in folder', async () => {
      const { server } = setup()
      const res = (await getHandler(
        server,
        'vault.list_recursive',
      )({
        folder: '/tmp/evil',
      })) as { isError: boolean }
      expect(res.isError).toBe(true)
    })

    it('rejects traversal in folder', async () => {
      const { server } = setup()
      const res = (await getHandler(
        server,
        'vault.list_recursive',
      )({
        folder: '../outside',
      })) as { isError: boolean }
      expect(res.isError).toBe(true)
    })
  })

  describe('vault.write size limit', () => {
    it('rejects content over 10 MB at schema layer', () => {
      const oversized = 'x'.repeat(10_000_001)
      const result = vaultWriteContentSchema.safeParse(oversized)
      expect(result.success).toBe(false)
    })

    it('accepts content exactly at 10 MB limit', () => {
      const atLimit = 'x'.repeat(10_000_000)
      const result = vaultWriteContentSchema.safeParse(atLimit)
      expect(result.success).toBe(true)
    })
  })

  describe('path normalisation — traverse and absolute path rejection', () => {
    it('vault.read rejects ../ traversal', async () => {
      const { server } = setup()
      const res = (await getHandler(server, 'vault.read')({ path: '../etc/passwd' })) as {
        isError: boolean
        content: [{ text: string }]
      }
      expect(res.isError).toBe(true)
      expect(res.content[0].text).toMatch(/unsafe path/)
    })

    it('vault.read rejects absolute Unix path', async () => {
      const { server } = setup()
      const res = (await getHandler(server, 'vault.read')({ path: '/etc/passwd' })) as {
        isError: boolean
        content: [{ text: string }]
      }
      expect(res.isError).toBe(true)
      expect(res.content[0].text).toMatch(/unsafe path/)
    })

    it('vault.read rejects absolute Windows path', async () => {
      const { server } = setup()
      const res = (await getHandler(
        server,
        'vault.read',
      )({
        path: 'C:\\Windows\\System32',
      })) as {
        isError: boolean
        content: [{ text: string }]
      }
      expect(res.isError).toBe(true)
      expect(res.content[0].text).toMatch(/unsafe path/)
    })

    it('vault.write rejects ../ traversal', async () => {
      const { server } = setup()
      const res = (await getHandler(
        server,
        'vault.write',
      )({
        path: '../../evil.md',
        content: 'x',
      })) as { isError: boolean }
      expect(res.isError).toBe(true)
    })

    it('vault.delete rejects absolute path', async () => {
      const { server } = setup()
      const res = (await getHandler(server, 'vault.delete')({ path: '/root/secret' })) as {
        isError: boolean
      }
      expect(res.isError).toBe(true)
    })

    it('vault.move rejects traversal in from', async () => {
      const { server } = setup()
      const res = (await getHandler(
        server,
        'vault.move',
      )({
        from: '../outside.md',
        to: 'safe.md',
      })) as { isError: boolean }
      expect(res.isError).toBe(true)
    })

    it('vault.move rejects traversal in to', async () => {
      const { server } = setup()
      const res = (await getHandler(
        server,
        'vault.move',
      )({
        from: 'safe.md',
        to: '../../evil.md',
      })) as { isError: boolean }
      expect(res.isError).toBe(true)
    })

    it('vault.list rejects traversal in folder', async () => {
      const { server } = setup()
      const res = (await getHandler(server, 'vault.list')({ folder: '../outside' })) as {
        isError: boolean
      }
      expect(res.isError).toBe(true)
    })

    it('vault.createFolder rejects absolute path', async () => {
      const { server } = setup()
      const res = (await getHandler(server, 'vault.createFolder')({ path: '/tmp/evil' })) as {
        isError: boolean
      }
      expect(res.isError).toBe(true)
    })
  })
})
