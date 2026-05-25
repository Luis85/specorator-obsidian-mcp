import { describe, it, expect } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerCliEvalTool } from '@/infrastructure/obsidian/mcp/registerCliEvalTool'
import { PermissionGate } from '@/application/mcp/PermissionGate'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
import { MockObsidianCliPort } from '@/infrastructure/mock/MockObsidianCliPort'
import { fakeModulePorts } from '@@/__fakes__/fake-ports'
import { makeAllowGate, getHandler, getRegisteredTools } from '@@/__fakes__/gate-helpers'

function setup(opts: { developerMode?: boolean; gate?: PermissionGate } = {}) {
  const { developerMode = true, gate: overrideGate } = opts
  const ports = fakeModulePorts()
  const gate = overrideGate ?? makeAllowGate(ports.confirmModal)
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  const cli = new MockObsidianCliPort()
  registerCliEvalTool(server, { cli, gate, developerMode })
  return { server, cli, ports, gate }
}

function makeDenyGate(modal: ReturnType<typeof fakeModulePorts>['confirmModal']): PermissionGate {
  return new PermissionGate(
    {
      getSettings: () => ({
        ...DEFAULT_SETTINGS,
        toolModes: { ...DEFAULT_SETTINGS.toolModes, 'cli.eval': 'deny' as const },
      }),
    },
    modal,
  )
}

describe('registerCliEvalTool', () => {
  it('developerMode: false → tool NOT registered', () => {
    const { server } = setup({ developerMode: false })
    const tools = getRegisteredTools(server)
    expect(tools['cli.eval']).toBeUndefined()
  })

  it('developerMode: true → tool registered', () => {
    const { server } = setup({ developerMode: true })
    const tools = getRegisteredTools(server)
    expect(tools).toHaveProperty('cli.eval')
  })

  it('developerMode on + gate allows: happy path returns stdout and stderr', async () => {
    const { server, cli } = setup({ developerMode: true })
    cli.respond('eval', { stdout: '42', stderr: '', exitCode: 0 })

    const result = (await getHandler(server, 'cli.eval')({ code: 'app.vault.getName()' })) as {
      content: [{ type: string; text: string }]
    }

    const parsed = JSON.parse(result.content[0]!.text) as { stdout: string; stderr: string }
    expect(parsed.stdout).toBe('42')
    expect(parsed.stderr).toBe('')
    expect(cli.callCount).toBe(1)
    expect(cli.calls[0]!.command).toBe('eval')
    expect((cli.calls[0]!.args as Record<string, string>)['code']).toBe('app.vault.getName()')
  })

  it('developerMode on + gate denies: deny envelope, CLI not invoked', async () => {
    const ports = fakeModulePorts()
    const gate = makeDenyGate(ports.confirmModal)
    const { server, cli } = setup({ developerMode: true, gate })

    const result = (await getHandler(server, 'cli.eval')({ code: 'app.vault.getName()' })) as {
      isError: boolean
      content: [{ text: string }]
    }

    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toMatch(/denied/)
    expect(cli.callCount).toBe(0)
  })

  it('developerMode on + CLI exit code != 0: err envelope returned', async () => {
    const { server, cli } = setup({ developerMode: true })
    cli.respond('eval', { stdout: '', stderr: 'ReferenceError: x is not defined', exitCode: 1 })

    const result = (await getHandler(server, 'cli.eval')({ code: 'x' })) as {
      isError: boolean
      content: [{ text: string }]
    }

    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toMatch(/eval failed/)
    expect(result.content[0]!.text).toMatch(/exit 1/)
    expect(cli.callCount).toBe(1)
  })

  it('timeoutMs is 30000 and code is forwarded as arg', async () => {
    const { server, cli } = setup({ developerMode: true })
    cli.respond('eval', { stdout: 'ok', stderr: '', exitCode: 0 })

    await getHandler(server, 'cli.eval')({ code: '1 + 1' })

    expect(cli.calls[0]!.timeoutMs).toBe(30_000)
    expect((cli.calls[0]!.args as Record<string, string>)['code']).toBe('1 + 1')
  })
})
