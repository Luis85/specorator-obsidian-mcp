import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { CanvasPort } from '@/domain/ports'
import type { PermissionGate } from '@/application/mcp/PermissionGate'
import { normalizeVaultPath } from '@/domain/shared/VaultPath'
import { ok, deny, err } from './shared'

function unsafePath(msg: string): { isError: true; content: [{ type: 'text'; text: string }] } {
  return err(`unsafe path: ${msg}`)
}

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

export function registerCanvasTools(
  server: McpServer,
  deps: { canvas: CanvasPort; gate: PermissionGate },
): void {
  const { canvas, gate } = deps

  server.registerTool(
    'canvas.read',
    {
      description: 'Read a JSON Canvas file (.canvas) — returns { nodes, edges }',
      inputSchema: { path: z.string().describe('Vault-relative .canvas path') },
    },
    async ({ path }) => {
      const norm = normalizeVaultPath(path)
      if (!norm.ok) return unsafePath(norm.error.message)
      return ok({ canvas: await canvas.readCanvas(norm.value) })
    },
  )

  server.registerTool(
    'canvas.write',
    {
      description: 'Write (overwrite) a JSON Canvas file with the provided nodes and edges',
      inputSchema: {
        path: z.string().describe('Vault-relative .canvas path'),
        data: z
          .object({
            nodes: z.array(CanvasNodeSchema).optional(),
            edges: z.array(CanvasEdgeSchema).optional(),
          })
          .describe('Full canvas data to write'),
      },
    },
    async ({ path, data }) => {
      const norm = normalizeVaultPath(path)
      if (!norm.ok) return unsafePath(norm.error.message)
      const safePath = norm.value
      const d = await gate.resolve('canvas.write', { path: safePath })
      if (d.decision === 'deny') {
        return deny(d.reason)
      }
      const canvasData = {
        nodes: Array.isArray(data.nodes) ? data.nodes : [],
        edges: Array.isArray(data.edges) ? data.edges : [],
      }
      await canvas.writeCanvas(safePath, canvasData)
      return ok({ written: true, path: safePath })
    },
  )
}
