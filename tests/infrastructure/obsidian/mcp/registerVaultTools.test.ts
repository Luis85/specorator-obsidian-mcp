import { describe, it, expect } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerVaultTools } from '@/infrastructure/obsidian/mcp/registerVaultTools'
import { fakeModulePorts } from '@@/__fakes__/fake-ports'

type RegisteredTool = {
  handler: (args: Record<string, unknown>) => Promise<unknown>
}
type ServerInternal = {
  _registeredTools: Record<string, RegisteredTool>
}

function setup() {
  const ports = fakeModulePorts()
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  registerVaultTools(server, { vault: ports.vault })
  const tools = (server as unknown as ServerInternal)._registeredTools
  return { server, ports, tools }
}

describe('registerVaultTools', () => {
  it('registers vault.read, vault.list, vault.exists, vault.write, vault.delete, vault.move, vault.createFolder', () => {
    const { tools } = setup()
    const names = Object.keys(tools).sort()
    expect(names).toContain('vault.read')
    expect(names).toContain('vault.list')
    expect(names).toContain('vault.exists')
    expect(names).toContain('vault.write')
    expect(names).toContain('vault.delete')
    expect(names).toContain('vault.move')
    expect(names).toContain('vault.createFolder')
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
})
