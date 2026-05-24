import { describe, it, expect, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerObsidianCliTools } from '@/infrastructure/obsidian/mcp/registerObsidianCliTools'
import { PermissionGate } from '@/application/mcp/PermissionGate'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
import { fakeModulePorts } from '@@/__fakes__/fake-ports'

type RegisteredTool = {
  handler: (args: Record<string, unknown>) => Promise<unknown>
}

function makeAllowGate(ports: ReturnType<typeof fakeModulePorts>) {
  const allAllow = Object.fromEntries(
    Object.keys(DEFAULT_SETTINGS.toolModes).map((k) => [k, 'allow' as const]),
  )
  return new PermissionGate(
    {
      getSettings: () => ({
        ...DEFAULT_SETTINGS,
        defaultMode: 'allow' as const,
        toolModes: allAllow,
      }),
    },
    ports.confirmModal,
  )
}

function setup() {
  const ports = fakeModulePorts()
  const gate = makeAllowGate(ports)
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  const fakeApp = {
    commands: {
      executeCommandById: vi.fn(() => true),
    },
  }
  registerObsidianCliTools(server, { app: fakeApp as any, gate })
  const tools = (server as unknown as { _registeredTools: Record<string, unknown> })
    ._registeredTools
  return { server, fakeApp, tools }
}

describe('registerObsidianCliTools', () => {
  it('registers cli.execute', () => {
    const { tools } = setup()
    expect(tools).toHaveProperty('cli.execute')
  })

  it('cli.execute invokes command and returns executed: true on success', async () => {
    const { fakeApp, tools } = setup()
    const result = (await (tools['cli.execute'] as RegisteredTool).handler({
      commandId: 'editor:save-file',
    })) as {
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
    const result = (await (tools['cli.execute'] as RegisteredTool).handler({
      commandId: 'unknown:cmd',
    })) as {
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

  it('cli.execute returns deny envelope when gate denies', async () => {
    const ports = fakeModulePorts()
    ;(ports.confirmModal as unknown as { answerWith: (c: 'allow' | 'allow-session' | 'deny') => void }).answerWith('deny')
    const gate = new PermissionGate(
      { getSettings: () => ({ ...DEFAULT_SETTINGS, defaultMode: 'ask' as const }) },
      ports.confirmModal,
    )
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    const fakeApp = {
      commands: { executeCommandById: vi.fn(() => true) },
    }
    registerObsidianCliTools(server, { app: fakeApp as any, gate })
    const tools = (server as unknown as { _registeredTools: Record<string, RegisteredTool> })
      ._registeredTools
    const res = (await tools['cli.execute'].handler({ commandId: 'editor:save-file' })) as {
      isError: boolean
    }
    expect(res.isError).toBe(true)
    // command must NOT have been executed
    expect(fakeApp.commands.executeCommandById).not.toHaveBeenCalled()
  })

  it('cli.execute executes when gate allows', async () => {
    const ports = fakeModulePorts()
    ;(ports.confirmModal as unknown as { answerWith: (c: 'allow' | 'allow-session' | 'deny') => void }).answerWith('allow')
    const gate = new PermissionGate(
      {
        getSettings: () => ({
          ...DEFAULT_SETTINGS,
          defaultMode: 'ask' as const,
          // override cli.execute from its default 'deny' to 'ask' so modal answer matters
          toolModes: { ...DEFAULT_SETTINGS.toolModes, 'cli.execute': 'ask' as const },
        }),
      },
      ports.confirmModal,
    )
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    const fakeApp = {
      commands: { executeCommandById: vi.fn(() => true) },
    }
    registerObsidianCliTools(server, { app: fakeApp as any, gate })
    const tools = (server as unknown as { _registeredTools: Record<string, RegisteredTool> })
      ._registeredTools
    await tools['cli.execute'].handler({ commandId: 'editor:save-file' })
    expect(fakeApp.commands.executeCommandById).toHaveBeenCalledWith('editor:save-file')
  })
})
