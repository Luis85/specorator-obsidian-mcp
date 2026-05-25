import { describe, it, expect } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerCliRunTool } from '@/infrastructure/obsidian/mcp/registerCliRunTool'
import { PermissionGate } from '@/application/mcp/PermissionGate'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
import { MockObsidianCliPort } from '@/infrastructure/mock/MockObsidianCliPort'
import { fakeModulePorts } from '@@/__fakes__/fake-ports'
import { makeAllowGate, getHandler, getRegisteredTools } from '@@/__fakes__/gate-helpers'

function setup(overrideGate?: PermissionGate) {
  const ports = fakeModulePorts()
  const gate = overrideGate ?? makeAllowGate(ports.confirmModal)
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  const cli = new MockObsidianCliPort()
  registerCliRunTool(server, { cli, gate })
  return { server, cli, ports, gate }
}

function makeDenyGate(modal: ReturnType<typeof fakeModulePorts>['confirmModal']): PermissionGate {
  return new PermissionGate(
    {
      getSettings: () => ({
        ...DEFAULT_SETTINGS,
        toolModes: { ...DEFAULT_SETTINGS.toolModes, 'cli.run': 'deny' as const },
      }),
    },
    modal,
  )
}

describe('registerCliRunTool', () => {
  it('registers cli.run in DEFAULT_TOOL_MODES (tool name present)', () => {
    const { server } = setup()
    const tools = getRegisteredTools(server)
    expect(tools).toHaveProperty('cli.run')
  })

  it('happy path: gate allows, CLI returns stdout/stderr/exitCode', async () => {
    const { server, cli } = setup()

    cli.respond('version', { stdout: '1.8.4', stderr: '', exitCode: 0 })

    const result = (await getHandler(server, 'cli.run')({ command: 'version' })) as {
      content: [{ type: string; text: string }]
    }

    const parsed = JSON.parse(result.content[0]!.text) as {
      stdout: string
      stderr: string
      exitCode: number
    }
    expect(parsed.stdout).toBe('1.8.4')
    expect(parsed.stderr).toBe('')
    expect(parsed.exitCode).toBe(0)
    expect(cli.callCount).toBe(1)
  })

  it('gate denies (no allow-list match, default deny) → deny envelope, CLI not called', async () => {
    const ports = fakeModulePorts()
    const gate = makeDenyGate(ports.confirmModal)
    const { server, cli } = setup(gate)

    const result = (await getHandler(server, 'cli.run')({ command: 'version' })) as {
      isError: boolean
      content: [{ text: string }]
    }

    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toMatch(/denied/)
    expect(cli.callCount).toBe(0)
  })

  it('allow-list prefix match bypasses deny mode', async () => {
    const ports = fakeModulePorts()
    const gate = new PermissionGate(
      {
        getSettings: () => ({
          ...DEFAULT_SETTINGS,
          defaultMode: 'deny' as const,
          toolModes: { ...DEFAULT_SETTINGS.toolModes, 'cli.run': 'deny' as const },
          cliRunAllowedPrefixes: ['version', 'help'],
        }),
      },
      ports.confirmModal,
    )
    const { server, cli } = setup(gate)

    cli.respond('version', { stdout: '1.8.4', stderr: '', exitCode: 0 })

    const result = (await getHandler(server, 'cli.run')({ command: 'version' })) as {
      content: [{ type: string; text: string }]
    }

    const parsed = JSON.parse(result.content[0]!.text) as { exitCode: number }
    expect(parsed.exitCode).toBe(0)
    expect(cli.callCount).toBe(1)
  })

  it('args and flags are forwarded to the CLI invocation', async () => {
    const { server, cli } = setup()

    cli.respond('search', { stdout: 'result', stderr: '', exitCode: 0 })

    await getHandler(
      server,
      'cli.run',
    )({
      command: 'search',
      args: { query: 'hello', exact: true },
      flags: ['--copy'],
      timeoutMs: 5000,
      vault: 'MyVault',
    })

    expect(cli.calls).toHaveLength(1)
    const inv = cli.calls[0]!
    expect(inv.command).toBe('search')
    expect(inv.args).toEqual({ query: 'hello', exact: true })
    expect(inv.flags).toEqual(['--copy'])
    expect(inv.timeoutMs).toBe(5000)
    expect(inv.vault).toBe('MyVault')
  })

  it('cliRunAllowedPrefixes does NOT affect cli.execute (independent lists)', async () => {
    const ports = fakeModulePorts()
    // Allow 'version' in the cli.run list but keep cli.execute in deny with empty execute list
    const gate = new PermissionGate(
      {
        getSettings: () => ({
          ...DEFAULT_SETTINGS,
          defaultMode: 'deny' as const,
          toolModes: {
            ...DEFAULT_SETTINGS.toolModes,
            'cli.run': 'deny' as const,
            'cli.execute': 'deny' as const,
          },
          cliRunAllowedPrefixes: ['version'],
          cliExecuteAllowedPrefixes: [],
        }),
      },
      ports.confirmModal,
    )
    // cli.run with prefix 'version' → allowed
    const runDecision = await gate.resolve('cli.run', { command: 'version' })
    expect(runDecision.decision).toBe('allow')
    expect(runDecision.reason).toBe('cli.run prefix-allowed')

    // cli.execute with commandId 'version:x' → still denied (no execute prefix match)
    const execDecision = await gate.resolve('cli.execute', { commandId: 'version:x' })
    expect(execDecision.decision).toBe('deny')
  })
})
