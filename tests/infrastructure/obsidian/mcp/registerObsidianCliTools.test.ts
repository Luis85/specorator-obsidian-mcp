import { describe, it, expect, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerObsidianCliTools } from '@/infrastructure/obsidian/mcp/registerObsidianCliTools'

type RegisteredTool = {
  handler: (args: Record<string, unknown>) => Promise<unknown>
}

function setup() {
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  const fakeApp = {
    commands: {
      executeCommandById: vi.fn(() => true),
    },
  }
  registerObsidianCliTools(server, { app: fakeApp as any })
  const tools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools
  return { server, fakeApp, tools }
}

describe('registerObsidianCliTools', () => {
  it('registers cli.execute', () => {
    const { tools } = setup()
    expect(tools).toHaveProperty('cli.execute')
  })

  it('cli.execute invokes command and returns executed: true on success', async () => {
    const { fakeApp, tools } = setup()
    const result = (await (tools['cli.execute'] as RegisteredTool).handler({ commandId: 'editor:save-file' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as { executed: boolean; commandId: string }
    expect(parsed.executed).toBe(true)
    expect(parsed.commandId).toBe('editor:save-file')
    expect(fakeApp.commands.executeCommandById).toHaveBeenCalledWith('editor:save-file')
  })

  it('cli.execute returns executed: false when command not found', async () => {
    const { fakeApp, tools } = setup()
    fakeApp.commands.executeCommandById.mockReturnValue(false)
    const result = (await (tools['cli.execute'] as RegisteredTool).handler({ commandId: 'unknown:cmd' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as { executed: boolean }
    expect(parsed.executed).toBe(false)
  })

  it('cli.execute does not use a denyList or proposal queue', () => {
    // Structural: only one tool registered, no extra wrappers
    const { tools } = setup()
    expect(Object.keys(tools)).toEqual(['cli.execute'])
  })
})
