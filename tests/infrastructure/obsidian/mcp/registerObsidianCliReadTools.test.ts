import { describe, it, expect } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerObsidianCliReadTools } from '@/infrastructure/obsidian/mcp/registerObsidianCliReadTools'

type RegisteredTool = {
  handler: (args: Record<string, unknown>) => Promise<unknown>
}
type ServerInternal = {
  _registeredTools: Record<string, RegisteredTool>
}

const FAKE_COMMANDS = [
  { id: 'editor:save-file', name: 'Save current file' },
  { id: 'app:open-settings', name: 'Open settings' },
  { id: 'obsidian-git:commit', name: 'Git: Commit all changes' },
]

function setup() {
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  const fakeApp = {
    commands: { listCommands: () => [...FAKE_COMMANDS] },
  }
  registerObsidianCliReadTools(server, { app: fakeApp })
  const tools = (server as unknown as ServerInternal)._registeredTools
  return { server, tools }
}

describe('registerObsidianCliReadTools', () => {
  it('registers exactly the two canonical cli read tools', () => {
    const { server } = setup()
    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools
    expect(Object.keys(tools).sort()).toEqual(['cli.read.find', 'cli.read.list'])
  })

  it('cli.read.list returns all commands', async () => {
    const { tools } = setup()
    const result = (await tools['cli.read.list'].handler({})) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as {
      commands: Array<{ id: string; name: string }>
    }
    expect(parsed.commands).toHaveLength(3)
    expect(parsed.commands.map((c) => c.id)).toContain('editor:save-file')
  })

  it('cli.read.find filters by id substring (case-insensitive)', async () => {
    const { tools } = setup()
    const result = (await tools['cli.read.find'].handler({ query: 'SETTINGS' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as {
      commands: Array<{ id: string; name: string }>
    }
    expect(parsed.commands).toHaveLength(1)
    expect(parsed.commands[0].id).toBe('app:open-settings')
  })

  it('cli.read.find filters by name substring', async () => {
    const { tools } = setup()
    const result = (await tools['cli.read.find'].handler({ query: 'git' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as {
      commands: Array<{ id: string; name: string }>
    }
    expect(parsed.commands).toHaveLength(1)
    expect(parsed.commands[0].id).toBe('obsidian-git:commit')
  })

  it('cli.read.find returns empty array when no match', async () => {
    const { tools } = setup()
    const result = (await tools['cli.read.find'].handler({ query: 'xyzzy-no-match' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as { commands: unknown[] }
    expect(parsed.commands).toHaveLength(0)
  })
})
