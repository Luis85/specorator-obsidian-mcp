import { describe, it, expect } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerVaultStatsTool } from '@/infrastructure/obsidian/mcp/registerVaultStatsTool'
import { fakeModulePorts } from '@@/__fakes__/fake-ports'
import { getHandler } from '@@/__fakes__/gate-helpers'

function setup() {
  const ports = fakeModulePorts()
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  registerVaultStatsTool(server, { vault: ports.vault })
  return { server, ports }
}

describe('vault.stats', () => {
  it('registers the vault.stats tool', () => {
    const { server } = setup()
    const handler = getHandler(server, 'vault.stats')
    expect(typeof handler).toBe('function')
  })

  it('returns correct totals and per-extension breakdown', async () => {
    const { server, ports } = setup()
    ports.vault.seedFile('note.md', 'hello world') // 11 bytes
    ports.vault.seedFile('other.md', 'foo') // 3 bytes
    ports.vault.seedFile('image.png', 'PNGDATA') // 6 bytes
    ports.vault.seedFile('config.json', '{"a":1}') // 7 bytes

    const result = (await getHandler(server, 'vault.stats')({})) as {
      structuredContent: {
        totalFiles: number
        totalBytes: number
        byExtension: Record<string, { count: number; bytes: number }>
      }
    }

    expect(result.structuredContent.totalFiles).toBe(4)
    expect(result.structuredContent.totalBytes).toBeGreaterThan(0)

    const byExt = result.structuredContent.byExtension
    expect(byExt['.md']).toBeDefined()
    expect(byExt['.md']!.count).toBe(2)
    expect(byExt['.png']).toBeDefined()
    expect(byExt['.png']!.count).toBe(1)
    expect(byExt['.json']).toBeDefined()
    expect(byExt['.json']!.count).toBe(1)
  })

  it('scopes stats to a subfolder', async () => {
    const { server, ports } = setup()
    ports.vault.seedFile('sub/a.md', 'aaa')
    ports.vault.seedFile('sub/b.md', 'bb')
    ports.vault.seedFile('root.md', 'root')

    const result = (await getHandler(server, 'vault.stats')({ folder: 'sub' })) as {
      structuredContent: { totalFiles: number }
    }

    expect(result.structuredContent.totalFiles).toBe(2)
  })

  it('returns error for unsafe folder path', async () => {
    const { server } = setup()
    const res = (await getHandler(server, 'vault.stats')({ folder: '../outside' })) as {
      isError: boolean
    }
    expect(res.isError).toBe(true)
  })

  it('returns totalFiles 0 for empty vault', async () => {
    const { server } = setup()
    const result = (await getHandler(server, 'vault.stats')({})) as {
      structuredContent: { totalFiles: number; totalBytes: number }
    }
    expect(result.structuredContent.totalFiles).toBe(0)
    expect(result.structuredContent.totalBytes).toBe(0)
  })

  it('returns structuredContent (okStructured regression — MCP SDK ≥1.10)', async () => {
    const { server, ports } = setup()
    ports.vault.seedFile('x.md', 'x')

    const result = (await getHandler(server, 'vault.stats')({})) as {
      structuredContent: { totalFiles: number }
      content: [{ text: string }]
    }

    expect(result).toHaveProperty('structuredContent')
    const parsed = JSON.parse(result.content[0].text) as { totalFiles: number }
    expect(parsed.totalFiles).toBe(result.structuredContent.totalFiles)
  })
})
