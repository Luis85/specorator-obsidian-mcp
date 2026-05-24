import { describe, it, expect, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  registerObsidianCliTools,
  type CliApp,
} from '@/infrastructure/obsidian/mcp/registerObsidianCliTools'
import { PermissionGate } from '@/application/mcp/PermissionGate'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
import { fakeModulePorts } from '@@/__fakes__/fake-ports'
import { makeAllowGate, getHandler, getRegisteredTools } from '@@/__fakes__/gate-helpers'

function setup() {
  const ports = fakeModulePorts()
  const gate = makeAllowGate(ports.confirmModal)
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  const fakeApp: CliApp = {
    commands: {
      executeCommandById: vi.fn(() => true),
    },
  }
  registerObsidianCliTools(server, { app: fakeApp, gate })
  return { server, fakeApp, ports }
}

describe('registerObsidianCliTools', () => {
  it('registers cli.execute', () => {
    const { server } = setup()
    const tools = getRegisteredTools(server)
    expect(tools).toHaveProperty('cli.execute')
  })

  it('cli.execute invokes command and returns executed: true on success', async () => {
    const { server, fakeApp } = setup()
    const result = (await getHandler(server, 'cli.execute')({
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
    const { server, fakeApp } = setup()
    vi.mocked(fakeApp.commands.executeCommandById).mockReturnValue(false)
    const result = (await getHandler(server, 'cli.execute')({ commandId: 'unknown:cmd' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as { executed: boolean }
    expect(parsed.executed).toBe(false)
  })

  it('cli.execute does not use a denyList or proposal queue', () => {
    const { server } = setup()
    const tools = getRegisteredTools(server)
    expect(Object.keys(tools)).toEqual(['cli.execute'])
  })

  it('cli.execute returns deny envelope when gate denies', async () => {
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
    const fakeApp: CliApp = {
      commands: { executeCommandById: vi.fn(() => true) },
    }
    registerObsidianCliTools(server, { app: fakeApp, gate })
    const res = (await getHandler(server, 'cli.execute')({
      commandId: 'editor:save-file',
    })) as { isError: boolean }
    expect(res.isError).toBe(true)
    expect(fakeApp.commands.executeCommandById).not.toHaveBeenCalled()
  })

  it('cli.execute executes when gate allows', async () => {
    const ports = fakeModulePorts()
    ;(
      ports.confirmModal as unknown as {
        answerWith: (c: 'allow' | 'allow-session' | 'deny') => void
      }
    ).answerWith('allow')
    const gate = new PermissionGate(
      {
        getSettings: () => ({
          ...DEFAULT_SETTINGS,
          defaultMode: 'ask' as const,
          toolModes: { ...DEFAULT_SETTINGS.toolModes, 'cli.execute': 'ask' as const },
        }),
      },
      ports.confirmModal,
    )
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    const fakeApp: CliApp = {
      commands: { executeCommandById: vi.fn(() => true) },
    }
    registerObsidianCliTools(server, { app: fakeApp, gate })
    await getHandler(server, 'cli.execute')({ commandId: 'editor:save-file' })
    expect(fakeApp.commands.executeCommandById).toHaveBeenCalledWith('editor:save-file')
  })
})
