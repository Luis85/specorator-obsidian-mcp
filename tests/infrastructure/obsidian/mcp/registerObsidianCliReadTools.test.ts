import { describe, it, expect } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerObsidianCliReadTools } from '@/infrastructure/obsidian/mcp/registerObsidianCliReadTools'
import { DEFAULT_TOOL_MODES } from '@/domain/settings/PluginSettings'
import { getHandler, getRegisteredTools } from '@@/__fakes__/gate-helpers'

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
  return { server }
}

describe('registerObsidianCliReadTools', () => {
  it('registers exactly the two canonical cli read tools', () => {
    const { server } = setup()
    const tools = getRegisteredTools(server)
    const expected = Object.keys(DEFAULT_TOOL_MODES)
      .filter((k) => k.startsWith('cli.read.'))
      .sort()
    expect(Object.keys(tools).sort()).toEqual(expected)
  })

  it('cli.read.list returns all commands', async () => {
    const { server } = setup()
    const result = (await getHandler(server, 'cli.read.list')({})) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as {
      commands: Array<{ id: string; name: string }>
    }
    expect(parsed.commands).toHaveLength(3)
    expect(parsed.commands.map((c) => c.id)).toContain('editor:save-file')
  })

  it('cli.read.find filters by id substring (case-insensitive)', async () => {
    const { server } = setup()
    const result = (await getHandler(server, 'cli.read.find')({ query: 'SETTINGS' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as {
      commands: Array<{ id: string; name: string }>
    }
    expect(parsed.commands).toHaveLength(1)
    expect(parsed.commands[0]!.id).toBe('app:open-settings')
  })

  it('cli.read.find filters by name substring', async () => {
    const { server } = setup()
    const result = (await getHandler(server, 'cli.read.find')({ query: 'git' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as {
      commands: Array<{ id: string; name: string }>
    }
    expect(parsed.commands).toHaveLength(1)
    expect(parsed.commands[0]!.id).toBe('obsidian-git:commit')
  })

  it('cli.read.find returns empty array when no match', async () => {
    const { server } = setup()
    const result = (await getHandler(server, 'cli.read.find')({ query: 'xyzzy-no-match' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as { commands: unknown[] }
    expect(parsed.commands).toHaveLength(0)
  })
})
