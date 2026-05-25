import { describe, it, expect, beforeEach } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerCliCuratedTools } from '@/infrastructure/obsidian/mcp/registerCliCuratedTools'
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
  registerCliCuratedTools(server, { cli, gate })
  return { server, cli, ports, gate }
}

function makeDenyGate(
  toolName: string,
  modal: ReturnType<typeof fakeModulePorts>['confirmModal'],
): PermissionGate {
  return new PermissionGate(
    {
      getSettings: () => ({
        ...DEFAULT_SETTINGS,
        toolModes: { ...DEFAULT_SETTINGS.toolModes, [toolName]: 'deny' as const },
      }),
    },
    modal,
  )
}

// ── Registration ─────────────────────────────────────────────────────────────

describe('registerCliCuratedTools — registration', () => {
  it('registers all 5 curated CLI tools', () => {
    const { server } = setup()
    const tools = getRegisteredTools(server)
    expect(tools).toHaveProperty('cli.daily_note')
    expect(tools).toHaveProperty('cli.workspace_load')
    expect(tools).toHaveProperty('cli.template_insert')
    expect(tools).toHaveProperty('cli.open_file')
    expect(tools).toHaveProperty('cli.reload')
  })
})

// ── cli.daily_note ────────────────────────────────────────────────────────────

describe('cli.daily_note', () => {
  let server: McpServer
  let cli: MockObsidianCliPort

  beforeEach(() => {
    ;({ server, cli } = setup())
  })

  it('happy path: invokes "daily" command and returns opened=true', async () => {
    cli.respond('daily', { stdout: 'ok', stderr: '', exitCode: 0 })

    const result = (await getHandler(server, 'cli.daily_note')({})) as {
      content: [{ type: string; text: string }]
    }

    const parsed = JSON.parse(result.content[0]!.text) as { opened: boolean; stdout: string }
    expect(parsed.opened).toBe(true)
    expect(parsed.stdout).toBe('ok')
    expect(cli.callCount).toBe(1)
    expect(cli.calls[0]!.command).toBe('daily')
  })

  it('gate denies → deny envelope, CLI not called', async () => {
    const ports = fakeModulePorts()
    const gate = makeDenyGate('cli.daily_note', ports.confirmModal)
    const { server: s, cli: c } = setup(gate)

    const result = (await getHandler(s, 'cli.daily_note')({})) as {
      isError: boolean
      content: [{ text: string }]
    }

    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toMatch(/denied/)
    expect(c.callCount).toBe(0)
  })
})

// ── cli.workspace_load ────────────────────────────────────────────────────────

describe('cli.workspace_load', () => {
  let server: McpServer
  let cli: MockObsidianCliPort

  beforeEach(() => {
    ;({ server, cli } = setup())
  })

  it('happy path: invokes "workspace:load" with correct name arg', async () => {
    cli.respond('workspace:load', { stdout: '', stderr: '', exitCode: 0 })

    const result = (await getHandler(server, 'cli.workspace_load')({ name: 'MyWorkspace' })) as {
      content: [{ type: string; text: string }]
    }

    const parsed = JSON.parse(result.content[0]!.text) as { loaded: boolean; name: string }
    expect(parsed.loaded).toBe(true)
    expect(parsed.name).toBe('MyWorkspace')
    expect(cli.callCount).toBe(1)
    const inv = cli.calls[0]!
    expect(inv.command).toBe('workspace:load')
    expect((inv.args as Record<string, string>)!.name).toBe('MyWorkspace')
  })

  it('gate denies → deny envelope, CLI not called', async () => {
    const ports = fakeModulePorts()
    const gate = makeDenyGate('cli.workspace_load', ports.confirmModal)
    const { server: s, cli: c } = setup(gate)

    const result = (await getHandler(s, 'cli.workspace_load')({ name: 'MyWorkspace' })) as {
      isError: boolean
      content: [{ text: string }]
    }

    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toMatch(/denied/)
    expect(c.callCount).toBe(0)
  })
})

// ── cli.template_insert ───────────────────────────────────────────────────────

describe('cli.template_insert', () => {
  let server: McpServer
  let cli: MockObsidianCliPort

  beforeEach(() => {
    ;({ server, cli } = setup())
  })

  it('happy path without file: invokes "template:insert" with template arg only', async () => {
    cli.respond('template:insert', { stdout: '', stderr: '', exitCode: 0 })

    const result = (await getHandler(server, 'cli.template_insert')({ template: 'meeting' })) as {
      content: [{ type: string; text: string }]
    }

    const parsed = JSON.parse(result.content[0]!.text) as {
      inserted: boolean
      template: string
      file: null
    }
    expect(parsed.inserted).toBe(true)
    expect(parsed.template).toBe('meeting')
    expect(parsed.file).toBeNull()
    expect(cli.callCount).toBe(1)
    const inv = cli.calls[0]!
    expect(inv.command).toBe('template:insert')
    expect((inv.args as Record<string, string>)!.template).toBe('meeting')
    expect((inv.args as Record<string, string>)!.file).toBeUndefined()
  })

  it('happy path with file: forwards file arg to CLI', async () => {
    cli.respond('template:insert', { stdout: '', stderr: '', exitCode: 0 })

    await getHandler(
      server,
      'cli.template_insert',
    )({ template: 'meeting', file: 'notes/2026-05-25.md' })

    expect(cli.callCount).toBe(1)
    const inv = cli.calls[0]!
    expect((inv.args as Record<string, string>)!.file).toBe('notes/2026-05-25.md')
  })

  it('gate denies → deny envelope, CLI not called', async () => {
    const ports = fakeModulePorts()
    const gate = makeDenyGate('cli.template_insert', ports.confirmModal)
    const { server: s, cli: c } = setup(gate)

    const result = (await getHandler(s, 'cli.template_insert')({ template: 'meeting' })) as {
      isError: boolean
      content: [{ text: string }]
    }

    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toMatch(/denied/)
    expect(c.callCount).toBe(0)
  })
})

// ── cli.open_file ─────────────────────────────────────────────────────────────

describe('cli.open_file', () => {
  let server: McpServer
  let cli: MockObsidianCliPort

  beforeEach(() => {
    ;({ server, cli } = setup())
  })

  it('happy path with file=: invokes "open" with file arg', async () => {
    cli.respond('open', { stdout: '', stderr: '', exitCode: 0 })

    const result = (await getHandler(
      server,
      'cli.open_file',
    )({ file: 'Daily Notes/Today.md', newtab: false })) as {
      content: [{ type: string; text: string }]
    }

    const parsed = JSON.parse(result.content[0]!.text) as { opened: boolean }
    expect(parsed.opened).toBe(true)
    expect(cli.callCount).toBe(1)
    const inv = cli.calls[0]!
    expect(inv.command).toBe('open')
    expect((inv.args as Record<string, string | boolean>)!.file).toBe('Daily Notes/Today.md')
  })

  it('happy path with path= and newtab=true: normalizes path and passes newtab', async () => {
    cli.respond('open', { stdout: '', stderr: '', exitCode: 0 })

    await getHandler(server, 'cli.open_file')({ path: 'notes/today.md', newtab: true })

    expect(cli.callCount).toBe(1)
    const inv = cli.calls[0]!
    expect((inv.args as Record<string, string | boolean>)!.path).toBe('notes/today.md')
    expect((inv.args as Record<string, string | boolean>)!.newtab).toBe(true)
  })

  it('schema: error when neither file nor path is provided', async () => {
    const result = (await getHandler(server, 'cli.open_file')({ newtab: false })) as {
      isError: boolean
      content: [{ text: string }]
    }

    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toMatch(/file.*path|path.*file/i)
  })

  it('schema: error when both file and path are provided', async () => {
    const result = (await getHandler(
      server,
      'cli.open_file',
    )({ file: 'foo.md', path: 'foo.md', newtab: false })) as {
      isError: boolean
      content: [{ text: string }]
    }

    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toMatch(/file.*path|path.*file/i)
  })

  it('rejects .. traversal in path', async () => {
    const result = (await getHandler(
      server,
      'cli.open_file',
    )({ path: '../secret.md', newtab: false })) as {
      isError: boolean
      content: [{ text: string }]
    }

    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toMatch(/unsafe path|traversal/i)
  })

  it('gate denies → deny envelope, CLI not called', async () => {
    const ports = fakeModulePorts()
    const gate = makeDenyGate('cli.open_file', ports.confirmModal)
    const { server: s, cli: c } = setup(gate)

    const result = (await getHandler(s, 'cli.open_file')({ file: 'foo.md', newtab: false })) as {
      isError: boolean
      content: [{ text: string }]
    }

    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toMatch(/denied/)
    expect(c.callCount).toBe(0)
  })
})

// ── cli.reload ────────────────────────────────────────────────────────────────

describe('cli.reload', () => {
  let server: McpServer
  let cli: MockObsidianCliPort

  beforeEach(() => {
    ;({ server, cli } = setup())
  })

  it('happy path: invokes "reload" and returns reloaded=true', async () => {
    cli.respond('reload', { stdout: '', stderr: '', exitCode: 0 })

    const result = (await getHandler(server, 'cli.reload')({})) as {
      content: [{ type: string; text: string }]
    }

    const parsed = JSON.parse(result.content[0]!.text) as { reloaded: boolean }
    expect(parsed.reloaded).toBe(true)
    expect(cli.callCount).toBe(1)
    expect(cli.calls[0]!.command).toBe('reload')
  })

  it('gate denies → deny envelope, CLI not called', async () => {
    const ports = fakeModulePorts()
    const gate = makeDenyGate('cli.reload', ports.confirmModal)
    const { server: s, cli: c } = setup(gate)

    const result = (await getHandler(s, 'cli.reload')({})) as {
      isError: boolean
      content: [{ text: string }]
    }

    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toMatch(/denied/)
    expect(c.callCount).toBe(0)
  })
})
