import { describe, it, expect } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerBasesTools } from '@/infrastructure/obsidian/mcp/registerBasesTools'
import { fakeModulePorts } from '@@/__fakes__/fake-ports'
import { makeAllowGate } from '@@/__fakes__/gate-helpers'
import { DEFAULT_TOOL_MODES } from '@/domain/settings/PluginSettings'
import { getHandler, getRegisteredTools } from '@@/__fakes__/gate-helpers'
import { MockConfirmModalPort } from '@/infrastructure/mock/MockConfirmModalPort'

function setup() {
  const ports = fakeModulePorts()
  const modal = new MockConfirmModalPort()
  const gate = makeAllowGate(modal)
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  registerBasesTools(server, { cli: ports.cli, vault: ports.vault, gate })
  return { server, ports, modal }
}

describe('registerBasesTools', () => {
  // ── 1. Registration ──────────────────────────────────────────────────────
  it('registers exactly the five canonical bases tools', () => {
    const { server } = setup()
    const tools = getRegisteredTools(server)
    const expected = Object.keys(DEFAULT_TOOL_MODES)
      .filter((k) => k.startsWith('bases.'))
      .sort()
    expect(Object.keys(tools).sort()).toEqual(expected)
    expect(Object.keys(tools)).toHaveLength(5)
  })

  // ── 2. bases.list ─────────────────────────────────────────────────────────
  it('bases.list parses CLI stdout into an array', async () => {
    const { server, ports } = setup()
    ports.cli.respond('bases', { stdout: 'views/tasks.base\nviews/projects.base\n', exitCode: 0 })
    const result = (await getHandler(server, 'bases.list')({})) as { content: [{ text: string }] }
    const parsed = JSON.parse(result.content[0].text) as { bases: string[] }
    expect(parsed.bases).toEqual(['views/tasks.base', 'views/projects.base'])
  })

  it('bases.list with folder filters client-side', async () => {
    const { server, ports } = setup()
    ports.cli.respond('bases', {
      stdout: 'views/tasks.base\narchive/old.base\nviews/projects.base\n',
      exitCode: 0,
    })
    const result = (await getHandler(server, 'bases.list')({ folder: 'views' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as { bases: string[] }
    expect(parsed.bases).toEqual(['views/tasks.base', 'views/projects.base'])
  })

  it('bases.list returns error when CLI fails', async () => {
    const { server, ports } = setup()
    ports.cli.respond('bases', { stdout: '', stderr: 'plugin not enabled', exitCode: 1 })
    const result = (await getHandler(server, 'bases.list')({})) as {
      isError: true
      content: [{ text: string }]
    }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('bases.list failed')
  })

  // ── 3. bases.views ────────────────────────────────────────────────────────
  it('bases.views passes file arg and returns raw text', async () => {
    const { server, ports } = setup()
    ports.cli.respond('base:views', { stdout: 'All Tasks\nCompleted\n', exitCode: 0 })
    const result = (await getHandler(server, 'bases.views')({ file: 'tasks' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as { views: string }
    expect(parsed.views).toBe('All Tasks\nCompleted\n')
    expect(ports.cli.calls[0]!.args).toMatchObject({ file: 'tasks' })
  })

  it('bases.views requires exactly one of file/path — neither given', async () => {
    const { server } = setup()
    const result = (await getHandler(server, 'bases.views')({})) as {
      isError: true
      content: [{ text: string }]
    }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('exactly one of')
  })

  it('bases.views requires exactly one of file/path — both given', async () => {
    const { server } = setup()
    const result = (await getHandler(
      server,
      'bases.views',
    )({
      file: 'tasks',
      path: 'views/tasks.base',
    })) as { isError: true; content: [{ text: string }] }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('not both')
  })

  it('bases.views passes path arg when path is provided', async () => {
    const { server, ports } = setup()
    ports.cli.respond('base:views', { stdout: 'My View\n', exitCode: 0 })
    await getHandler(server, 'bases.views')({ path: 'views/tasks.base' })
    expect(ports.cli.calls[0]!.args).toMatchObject({ path: 'views/tasks.base' })
    expect(ports.cli.calls[0]!.args).not.toHaveProperty('file')
  })

  // ── 4. bases.query ────────────────────────────────────────────────────────
  it('bases.query format=json parses valid JSON', async () => {
    const { server, ports } = setup()
    const payload = [{ path: 'notes/a.md', status: 'active' }]
    ports.cli.respond('base:query', { stdout: JSON.stringify(payload), exitCode: 0 })
    const result = (await getHandler(
      server,
      'bases.query',
    )({
      file: 'tasks',
      format: 'json',
    })) as { content: [{ text: string }] }
    const parsed = JSON.parse(result.content[0].text) as { result: unknown; format: string }
    expect(parsed.format).toBe('json')
    expect(parsed.result).toEqual(payload)
  })

  it('bases.query format=json with malformed JSON returns raw stdout and warning', async () => {
    const { server, ports } = setup()
    ports.cli.respond('base:query', { stdout: 'not-json{{{', exitCode: 0 })
    const result = (await getHandler(
      server,
      'bases.query',
    )({
      file: 'tasks',
      format: 'json',
    })) as { content: [{ text: string }] }
    const parsed = JSON.parse(result.content[0].text) as {
      result: string
      format: string
      warning?: string
    }
    expect(parsed.format).toBe('json')
    expect(typeof parsed.result).toBe('string')
    expect(parsed.warning).toBeTruthy()
  })

  it('bases.query format=paths splits lines', async () => {
    const { server, ports } = setup()
    ports.cli.respond('base:query', {
      stdout: 'notes/a.md\nnotes/b.md\nnotes/c.md\n',
      exitCode: 0,
    })
    const result = (await getHandler(
      server,
      'bases.query',
    )({
      file: 'tasks',
      format: 'paths',
    })) as { content: [{ text: string }] }
    const parsed = JSON.parse(result.content[0].text) as { result: string[]; format: string }
    expect(parsed.format).toBe('paths')
    expect(parsed.result).toEqual(['notes/a.md', 'notes/b.md', 'notes/c.md'])
  })

  it('bases.query format=md returns raw stdout', async () => {
    const { server, ports } = setup()
    ports.cli.respond('base:query', { stdout: '# Tasks\n- item1\n', exitCode: 0 })
    const result = (await getHandler(
      server,
      'bases.query',
    )({
      file: 'tasks',
      format: 'md',
    })) as { content: [{ text: string }] }
    const parsed = JSON.parse(result.content[0].text) as { result: string; format: string }
    expect(parsed.format).toBe('md')
    expect(parsed.result).toBe('# Tasks\n- item1\n')
  })

  it('bases.query format=csv returns raw stdout', async () => {
    const { server, ports } = setup()
    ports.cli.respond('base:query', { stdout: 'path,status\nnotes/a.md,active\n', exitCode: 0 })
    const result = (await getHandler(
      server,
      'bases.query',
    )({
      file: 'tasks',
      format: 'csv',
    })) as { content: [{ text: string }] }
    const parsed = JSON.parse(result.content[0].text) as { result: string; format: string }
    expect(parsed.format).toBe('csv')
    expect(parsed.result).toContain('path,status')
  })

  it('bases.query requires exactly one of file/path', async () => {
    const { server } = setup()
    const result = (await getHandler(server, 'bases.query')({ format: 'json' })) as {
      isError: true
      content: [{ text: string }]
    }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('exactly one of')
  })

  it('bases.query passes view arg when provided', async () => {
    const { server, ports } = setup()
    ports.cli.respond('base:query', { stdout: '[]', exitCode: 0 })
    await getHandler(server, 'bases.query')({ file: 'tasks', view: 'Active', format: 'json' })
    expect(ports.cli.calls[0]!.args).toMatchObject({ view: 'Active' })
  })

  // ── 5. bases.read ─────────────────────────────────────────────────────────
  it('bases.read returns raw vault file content', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('views/tasks.base', 'view: table\nfilter: status = active\n')
    const result = (await getHandler(
      server,
      'bases.read',
    )({
      path: 'views/tasks.base',
    })) as { content: [{ text: string }] }
    const parsed = JSON.parse(result.content[0].text) as { content: string }
    expect(parsed.content).toBe('view: table\nfilter: status = active\n')
  })

  it('bases.read rejects unsafe .. paths', async () => {
    const { server } = setup()
    const result = (await getHandler(
      server,
      'bases.read',
    )({
      path: '../outside/vault.base',
    })) as { isError: true; content: [{ text: string }] }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('unsafe path')
  })

  // ── 6. bases.create ───────────────────────────────────────────────────────
  it('bases.create invokes CLI with correct args and returns { created: true }', async () => {
    const { server, ports } = setup()
    ports.cli.respond('base:create', { stdout: 'created: notes/new-task.md', exitCode: 0 })
    const result = (await getHandler(
      server,
      'bases.create',
    )({
      name: 'New Task',
      file: 'tasks',
    })) as { content: [{ text: string }] }
    const parsed = JSON.parse(result.content[0].text) as { created: boolean; stdout: string }
    expect(parsed.created).toBe(true)
    expect(parsed.stdout).toContain('notes/new-task.md')
    expect(ports.cli.calls[0]!.args).toMatchObject({ name: 'New Task', file: 'tasks' })
  })

  it('bases.create passes optional content and view args', async () => {
    const { server, ports } = setup()
    ports.cli.respond('base:create', { stdout: '', exitCode: 0 })
    await getHandler(
      server,
      'bases.create',
    )({
      name: 'My Note',
      path: 'views/tasks.base',
      view: 'Active',
      content: 'some content',
    })
    expect(ports.cli.calls[0]!.args).toMatchObject({
      name: 'My Note',
      path: 'views/tasks.base',
      view: 'Active',
      content: 'some content',
    })
  })

  it('bases.create gate deny returns deny envelope without calling CLI', async () => {
    const ports = fakeModulePorts()
    const modal = new MockConfirmModalPort()
    // modal defaults to 'deny' — leave it as-is (deny is the safe default)
    const { PermissionGate } = await import('@/application/mcp/PermissionGate')
    const { DEFAULT_SETTINGS } = await import('@/domain/settings/PluginSettings')
    const denySettings = {
      ...DEFAULT_SETTINGS,
      toolModes: { ...DEFAULT_SETTINGS.toolModes, 'bases.create': 'ask' as const },
    }
    const denyGate = new PermissionGate({ getSettings: () => denySettings }, modal)
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerBasesTools(server, { cli: ports.cli, vault: ports.vault, gate: denyGate })

    const result = (await getHandler(server, 'bases.create')({ name: 'Blocked' })) as {
      isError: true
      content: [{ text: string }]
    }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('denied')
    expect(ports.cli.callCount).toBe(0)
  })
})
