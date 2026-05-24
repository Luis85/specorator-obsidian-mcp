import { describe, it, expect } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerObsidianCliTools } from '@/infrastructure/obsidian/mcp/registerObsidianCliTools'

type RegisteredTool = {
  handler: (args: Record<string, unknown>) => Promise<unknown>
}
type ServerInternal = {
  _registeredTools: Record<string, RegisteredTool>
}

describe('registerObsidianCliTools', () => {
  it('registers cli.execute', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    const fakeApp = { commands: { executeCommandById: () => true } }
    registerObsidianCliTools(server, { app: fakeApp })
    const tools = (server as unknown as ServerInternal)._registeredTools
    expect(tools).toHaveProperty('cli.execute')
  })

  it('cli.execute invokes command and returns executed: true on success', async () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    let called = ''
    const fakeApp = {
      commands: {
        executeCommandById: (id: string) => {
          called = id
          return true
        },
      },
    }
    registerObsidianCliTools(server, { app: fakeApp })
    const tools = (server as unknown as ServerInternal)._registeredTools
    const result = (await tools['cli.execute'].handler({ commandId: 'editor:save-file' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as { executed: boolean; commandId: string }
    expect(parsed.executed).toBe(true)
    expect(parsed.commandId).toBe('editor:save-file')
    expect(called).toBe('editor:save-file')
  })

  it('cli.execute returns executed: false when command not found', async () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    const fakeApp = { commands: { executeCommandById: () => false } }
    registerObsidianCliTools(server, { app: fakeApp })
    const tools = (server as unknown as ServerInternal)._registeredTools
    const result = (await tools['cli.execute'].handler({ commandId: 'unknown:cmd' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as { executed: boolean }
    expect(parsed.executed).toBe(false)
  })

  it('cli.execute does not use a denyList or proposal queue', () => {
    // Structural: only one tool registered, no extra wrappers
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    const fakeApp = { commands: { executeCommandById: () => true } }
    registerObsidianCliTools(server, { app: fakeApp })
    const tools = (server as unknown as ServerInternal)._registeredTools
    expect(Object.keys(tools)).toEqual(['cli.execute'])
  })
})
