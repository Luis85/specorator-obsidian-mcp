import { describe, it, expect } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { registerCanvasTools } from '@/infrastructure/obsidian/mcp/registerCanvasTools'
import { PermissionGate } from '@/application/mcp/PermissionGate'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
import { fakeModulePorts } from '@@/__fakes__/fake-ports'
import { makeAllowGate, getHandler, getRegisteredTools } from '@@/__fakes__/gate-helpers'

// Export the schemas from the module for direct schema-validation tests.
// We replicate the same definitions here to test the Zod shapes independently
// (the registrar does not re-export them, but the contract is expressed below).
const CanvasNodeSchema = z
  .object({
    id: z.string(),
    type: z.enum(['text', 'file', 'link', 'group']),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  })
  .passthrough()

const CanvasEdgeSchema = z
  .object({
    id: z.string(),
    fromNode: z.string(),
    toNode: z.string(),
  })
  .passthrough()

function setup() {
  const ports = fakeModulePorts()
  const gate = makeAllowGate(ports.confirmModal)
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  registerCanvasTools(server, { canvas: ports.canvas, gate })
  return { server, ports }
}

describe('registerCanvasTools', () => {
  it('registers exactly the two canonical canvas tools', () => {
    const { server } = setup()
    const tools = getRegisteredTools(server)
    const expected = Object.keys(DEFAULT_SETTINGS.toolModes)
      .filter((k) => k.startsWith('canvas.'))
      .sort()
    expect(Object.keys(tools).sort()).toEqual(expected)
  })

  it('canvas.read returns canvas data', async () => {
    const { server, ports } = setup()
    const data = {
      nodes: [{ id: 'n1', type: 'text', text: 'hello', x: 0, y: 0, width: 100, height: 50 }],
      edges: [],
    }
    ports.bridge.seedCanvas('board.canvas', data)
    const result = (await getHandler(server, 'canvas.read')({ path: 'board.canvas' })) as {
      content: [{ text: string }]
    }
    const parsed = JSON.parse(result.content[0].text) as { canvas: typeof data }
    expect(parsed.canvas.nodes).toHaveLength(1)
    expect(parsed.canvas.edges).toHaveLength(0)
  })

  it('canvas.write mutates canvas directly (no proposal queue)', async () => {
    const { server, ports } = setup()
    ports.bridge.seedCanvas('board.canvas', { nodes: [], edges: [] })
    const newData = {
      nodes: [{ id: 'n2', type: 'text', text: 'world', x: 10, y: 10, width: 100, height: 50 }],
      edges: [{ id: 'e1', fromNode: 'n2', toNode: 'n2' }],
    }
    await getHandler(server, 'canvas.write')({ path: 'board.canvas', data: newData })
    const written = ports.bridge.getWrittenCanvas('board.canvas')
    expect(written).toBeDefined()
    expect(written!.nodes).toHaveLength(1)
    expect(written!.edges).toHaveLength(1)
  })

  it('canvas.write uses empty arrays when nodes/edges omitted', async () => {
    const { server, ports } = setup()
    ports.bridge.seedCanvas('empty.canvas', { nodes: [], edges: [] })
    await getHandler(server, 'canvas.write')({ path: 'empty.canvas', data: {} })
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
    ports.bridge.seedCanvas('board.canvas', { nodes: [], edges: [] })
    const res = (await getHandler(
      server,
      'canvas.write',
    )({
      path: 'board.canvas',
      data: { nodes: [], edges: [] },
    })) as { isError: boolean }
    expect(res.isError).toBe(true)
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
    ports.bridge.seedCanvas('board.canvas', { nodes: [], edges: [] })
    await getHandler(
      server,
      'canvas.write',
    )({
      path: 'board.canvas',
      data: { nodes: [{ id: 'n1', type: 'text', x: 0, y: 0, width: 100, height: 50 }], edges: [] },
    })
    const written = ports.bridge.getWrittenCanvas('board.canvas')
    expect(written).toBeDefined()
    expect(written!.nodes).toHaveLength(1)
  })

  describe('CanvasNodeSchema', () => {
    it('rejects a node missing required fields (no type/x/y/width/height)', () => {
      const result = CanvasNodeSchema.safeParse({ id: 'n1' })
      expect(result.success).toBe(false)
    })

    it('accepts a valid node', () => {
      const result = CanvasNodeSchema.safeParse({
        id: 'n1',
        type: 'text',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
      })
      expect(result.success).toBe(true)
    })

    it('preserves extension fields via passthrough', () => {
      const result = CanvasNodeSchema.safeParse({
        id: 'n1',
        type: 'text',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        color: '#ff0000',
        text: 'hello',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect((result.data as Record<string, unknown>)['color']).toBe('#ff0000')
        expect((result.data as Record<string, unknown>)['text']).toBe('hello')
      }
    })
  })

  describe('CanvasEdgeSchema', () => {
    it('rejects an edge missing required fields', () => {
      const result = CanvasEdgeSchema.safeParse({ id: 'e1' })
      expect(result.success).toBe(false)
    })

    it('accepts a valid edge', () => {
      const result = CanvasEdgeSchema.safeParse({ id: 'e1', fromNode: 'n1', toNode: 'n2' })
      expect(result.success).toBe(true)
    })

    it('preserves extension fields via passthrough', () => {
      const result = CanvasEdgeSchema.safeParse({
        id: 'e1',
        fromNode: 'n1',
        toNode: 'n2',
        label: 'relates to',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect((result.data as Record<string, unknown>)['label']).toBe('relates to')
      }
    })
  })
})
