import { describe, it, expect } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerCanvasTools } from '@/infrastructure/obsidian/mcp/registerCanvasTools'
import { PermissionGate } from '@/application/mcp/PermissionGate'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
import { fakeModulePorts } from '@@/__fakes__/fake-ports'

type RegisteredTool = {
  handler: (args: Record<string, unknown>) => Promise<unknown>
}
type ServerInternal = {
  _registeredTools: Record<string, RegisteredTool>
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
  registerCanvasTools(server, { canvas: ports.canvas, gate })
  const tools = (server as unknown as ServerInternal)._registeredTools
  return { server, ports, tools }
}

describe('registerCanvasTools', () => {
  it('registers exactly the two canonical canvas tools', () => {
    const { server } = setup()
    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools
    const expected = Object.keys(DEFAULT_SETTINGS.toolModes)
      .filter((k) => k.startsWith('canvas.'))
      .sort()
    expect(Object.keys(tools).sort()).toEqual(expected)
  })

  it('canvas.read returns canvas data', async () => {
    const { tools, ports } = setup()
    const data = {
      nodes: [{ id: 'n1', type: 'text', text: 'hello', x: 0, y: 0, width: 100, height: 50 }],
      edges: [],
    }
    ports.bridge.seedCanvas('board.canvas', data)
    const result = (await tools['canvas.read'].handler({ path: 'board.canvas' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as { canvas: typeof data }
    expect(parsed.canvas.nodes).toHaveLength(1)
    expect(parsed.canvas.edges).toHaveLength(0)
  })

  it('canvas.write mutates canvas directly (no proposal queue)', async () => {
    const { tools, ports } = setup()
    ports.bridge.seedCanvas('board.canvas', { nodes: [], edges: [] })
    const newData = {
      nodes: [{ id: 'n2', type: 'text', text: 'world', x: 10, y: 10, width: 100, height: 50 }],
      edges: [{ id: 'e1', fromNode: 'n2', toNode: 'n2' }],
    }
    await tools['canvas.write'].handler({ path: 'board.canvas', data: newData })
    const written = ports.bridge.getWrittenCanvas('board.canvas')
    expect(written).toBeDefined()
    expect(written!.nodes).toHaveLength(1)
    expect(written!.edges).toHaveLength(1)
  })

  it('canvas.write uses empty arrays when nodes/edges omitted', async () => {
    const { tools, ports } = setup()
    ports.bridge.seedCanvas('empty.canvas', { nodes: [], edges: [] })
    await tools['canvas.write'].handler({ path: 'empty.canvas', data: {} })
    const written = ports.bridge.getWrittenCanvas('empty.canvas')
    expect(written!.nodes).toEqual([])
    expect(written!.edges).toEqual([])
  })

  it('canvas.write returns deny envelope when gate denies', async () => {
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
    registerCanvasTools(server, { canvas: ports.canvas, gate })
    const tools = (server as unknown as ServerInternal)._registeredTools
    ports.bridge.seedCanvas('board.canvas', { nodes: [], edges: [] })
    const res = (await tools['canvas.write'].handler({
      path: 'board.canvas',
      data: { nodes: [], edges: [] },
    })) as { isError: boolean }
    expect(res.isError).toBe(true)
    // canvas must NOT have been written
    expect(ports.bridge.getWrittenCanvas('board.canvas')).toBeUndefined()
  })

  it('canvas.write writes when gate allows', async () => {
    const ports = fakeModulePorts()
    ;(
      ports.confirmModal as unknown as {
        answerWith: (c: 'allow' | 'allow-session' | 'deny') => void
      }
    ).answerWith('allow')
    const gate = new PermissionGate(
      { getSettings: () => ({ ...DEFAULT_SETTINGS, defaultMode: 'ask' as const }) },
      ports.confirmModal,
    )
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerCanvasTools(server, { canvas: ports.canvas, gate })
    const tools = (server as unknown as ServerInternal)._registeredTools
    ports.bridge.seedCanvas('board.canvas', { nodes: [], edges: [] })
    await tools['canvas.write'].handler({
      path: 'board.canvas',
      data: { nodes: [{ id: 'n1' }], edges: [] },
    })
    const written = ports.bridge.getWrittenCanvas('board.canvas')
    expect(written).toBeDefined()
    expect(written!.nodes).toHaveLength(1)
  })
})
