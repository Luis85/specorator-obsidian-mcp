import { describe, it, expect } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerVaultTools } from '@/infrastructure/obsidian/mcp/registerVaultTools'
import { PermissionGate } from '@/application/mcp/PermissionGate'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
import { fakeModulePorts } from '@@/__fakes__/fake-ports'
import { makeAllowGate, getHandler, getRegisteredTools } from '@@/__fakes__/gate-helpers'

function setup() {
  const ports = fakeModulePorts()
  const gate = makeAllowGate(ports.confirmModal)
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  registerVaultTools(server, { vault: ports.vault, gate })
  return { server, ports }
}

describe('registerVaultTools', () => {
  it('registers exactly the seven canonical vault tools', () => {
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
