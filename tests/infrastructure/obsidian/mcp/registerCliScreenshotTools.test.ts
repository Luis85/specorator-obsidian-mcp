import { describe, it, expect } from 'vitest'
import { promises as fs } from 'node:fs'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerCliScreenshotTools } from '@/infrastructure/obsidian/mcp/registerCliScreenshotTools'
import { PermissionGate } from '@/application/mcp/PermissionGate'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
import { MockObsidianCliPort } from '@/infrastructure/mock/MockObsidianCliPort'
import { fakeModulePorts } from '@@/__fakes__/fake-ports'
import { makeAllowGate, getHandler, getRegisteredTools } from '@@/__fakes__/gate-helpers'

/** A minimal 8-byte PNG (1×1 transparent pixel). */
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
    '0000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
  'hex',
)

function setup(overrideGate?: PermissionGate) {
  const ports = fakeModulePorts()
  const gate = overrideGate ?? makeAllowGate(ports.confirmModal)
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  const cli = new MockObsidianCliPort()
  registerCliScreenshotTools(server, { cli, gate })
  return { server, cli, ports, gate }
}

function makeDenyGate(modal: ReturnType<typeof fakeModulePorts>['confirmModal']): PermissionGate {
  return new PermissionGate(
    {
      getSettings: () => ({
        ...DEFAULT_SETTINGS,
        toolModes: { ...DEFAULT_SETTINGS.toolModes, 'cli.screenshot': 'deny' as const },
      }),
    },
    modal,
  )
}

describe('registerCliScreenshotTools', () => {
  it('registers cli.screenshot', () => {
    const { server } = setup()
    const tools = getRegisteredTools(server)
    expect(tools).toHaveProperty('cli.screenshot')
  })

  it('happy path: returns text summary + image content when CLI succeeds', async () => {
    const { server, cli } = setup()

    // Side-effect: write the tiny PNG to whatever path the CLI received
    cli.respond('dev:screenshot', { exitCode: 0 }, async (inv) => {
      const path = inv.args?.['path']
      if (typeof path === 'string') await fs.writeFile(path, TINY_PNG)
    })

    const result = (await getHandler(server, 'cli.screenshot')({})) as {
      content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>
    }

    expect(result.content).toHaveLength(2)
    expect(result.content[0]!.type).toBe('text')
    expect(result.content[0]!.text).toMatch(/Screenshot captured: \d+ bytes/)
    expect(result.content[1]!.type).toBe('image')
    expect(result.content[1]!.mimeType).toBe('image/png')
    // data must be valid base64 representing our PNG
    const decoded = Buffer.from(result.content[1]!.data!, 'base64')
    expect(decoded).toEqual(TINY_PNG)
  })

  it('gate denies → deny envelope, CLI not invoked', async () => {
    const ports = fakeModulePorts()
    const gate = makeDenyGate(ports.confirmModal)
    const { server, cli } = setup(gate)

    const result = (await getHandler(server, 'cli.screenshot')({})) as {
      isError: boolean
      content: [{ text: string }]
    }

    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toMatch(/denied/)
    expect(cli.callCount).toBe(0)
  })

  it('CLI exit code != 0 → err envelope', async () => {
    const { server, cli } = setup()

    cli.respond('dev:screenshot', { exitCode: 1, stderr: 'Obsidian not running' })

    const result = (await getHandler(server, 'cli.screenshot')({})) as {
      isError: boolean
      content: [{ text: string }]
    }

    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toMatch(/screenshot failed/)
    expect(result.content[0]!.text).toContain('Obsidian not running')
  })

  it('CLI succeeds but output file not written → err envelope mentioning file read failure', async () => {
    const { server, cli } = setup()

    // Respond with exit 0 but no side-effect (file never written)
    cli.respond('dev:screenshot', { exitCode: 0 })

    const result = (await getHandler(server, 'cli.screenshot')({})) as {
      isError: boolean
      content: [{ text: string }]
    }

    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toMatch(/failed to read screenshot output/)
  })
})
