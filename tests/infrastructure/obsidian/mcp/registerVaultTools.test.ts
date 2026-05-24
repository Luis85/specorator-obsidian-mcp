import { describe, it, expect } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerVaultTools } from '@/infrastructure/obsidian/mcp/registerVaultTools'
import { PermissionGate } from '@/application/mcp/PermissionGate'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
import { fakeModulePorts } from '@@/__fakes__/fake-ports'
import { makeAllowGate, type ServerInternal } from '@@/__fakes__/gate-helpers'

function setup() {
  const ports = fakeModulePorts()
  const gate = makeAllowGate(ports.confirmModal)
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  registerVaultTools(server, { vault: ports.vault, gate })
  const tools = (server as unknown as ServerInternal)._registeredTools
  return { server, ports, tools }
}

describe('registerVaultTools', () => {
  it('registers exactly the seven canonical vault tools', () => {
    const { server } = setup()
    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools
    const expected = Object.keys(DEFAULT_SETTINGS.toolModes)
      .filter((k) => k.startsWith('vault.'))
      .sort()
    expect(Object.keys(tools).sort()).toEqual(expected)
  })

  it('vault.write mutates vault directly (no proposal queue)', async () => {
    const { tools, ports } = setup()
    await tools['vault.write'].handler({ path: 'a.md', content: 'hi' })
    expect(await ports.vault.readFile('a.md')).toBe('hi')
  })

  it('vault.read returns file content', async () => {
    const { tools, ports } = setup()
    await ports.vault.writeFile('b.md', 'hello')
    const result = (await tools['vault.read'].handler({ path: 'b.md' })) as {
      content: [{ text: string }]
    }
    expect(JSON.parse(result.content[0].text)).toEqual({ content: 'hello' })
  })

  it('vault.exists returns true for existing file', async () => {
    const { tools, ports } = setup()
    await ports.vault.writeFile('c.md', '')
    const result = (await tools['vault.exists'].handler({ path: 'c.md' })) as {
      content: [{ text: string }]
    }
    expect(JSON.parse(result.content[0].text)).toEqual({ exists: true })
  })

  it('vault.exists returns false for missing file', async () => {
    const { tools } = setup()
    const result = (await tools['vault.exists'].handler({ path: 'missing.md' })) as {
      content: [{ text: string }]
    }
    expect(JSON.parse(result.content[0].text)).toEqual({ exists: false })
  })

  it('vault.delete removes file from vault', async () => {
    const { tools, ports } = setup()
    await ports.vault.writeFile('del.md', 'bye')
    await tools['vault.delete'].handler({ path: 'del.md' })
    expect(await ports.vault.fileExists('del.md')).toBe(false)
  })

  it('vault.move copies content to new path and removes old', async () => {
    const { tools, ports } = setup()
    await ports.vault.writeFile('old.md', 'content')
    await tools['vault.move'].handler({ from: 'old.md', to: 'new.md' })
    expect(await ports.vault.readFile('new.md')).toBe('content')
    expect(await ports.vault.fileExists('old.md')).toBe(false)
  })

  it('vault.createFolder creates a folder', async () => {
    const { tools, ports } = setup()
    await tools['vault.createFolder'].handler({ path: 'myfolder' })
    // listFolders on '' should contain 'myfolder'
    const folders = await ports.vault.listFolders('')
    expect(folders).toContain('myfolder')
  })

  it('vault.list returns files and subfolders', async () => {
    const { tools, ports } = setup()
    await ports.vault.writeFile('docs/a.md', '')
    await ports.vault.writeFile('docs/sub/b.md', '')
    const result = (await tools['vault.list'].handler({ folder: 'docs' })) as {
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
    const tools = (server as unknown as ServerInternal)._registeredTools
    const res = (await tools['vault.write'].handler({ path: 'a.md', content: 'hi' })) as {
      isError: boolean
    }
    expect(res.isError).toBe(true)
    // vault must NOT have been written
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
    const tools = (server as unknown as ServerInternal)._registeredTools
    await ports.vault.writeFile('notes/a.md', 'content')
    const res = (await tools['vault.move'].handler({
      from: 'notes/a.md',
      to: '.obsidian/community-plugins.json',
    })) as { isError: boolean }
    expect(res.isError).toBe(true)
    // original file must NOT have been moved
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
    const tools = (server as unknown as ServerInternal)._registeredTools
    await tools['vault.write'].handler({ path: 'a.md', content: 'hi' })
    expect(await ports.vault.readFile('a.md')).toBe('hi')
  })
})
