import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { CanvasPort } from '@/domain/ports'
import type { PermissionGate } from '@/application/mcp/PermissionGate'
import { ok } from './shared'

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
    async ({ path }) => ok({ canvas: await canvas.readCanvas(path) }),
  )

  server.registerTool(
    'canvas.write',
    {
      description: 'Write (overwrite) a JSON Canvas file with the provided nodes and edges',
      inputSchema: {
        path: z.string().describe('Vault-relative .canvas path'),
        data: z
          .object({
            nodes: z.array(z.unknown()).optional(),
            edges: z.array(z.unknown()).optional(),
          })
          .describe('Full canvas data to write'),
      },
    },
    async ({ path, data }) => {
      const d = await gate.resolve('canvas.write', { path })
      if (d.decision === 'deny') {
        return { isError: true, content: [{ type: 'text' as const, text: `denied: ${d.reason}` }] }
      }
      const canvasData = {
        nodes: Array.isArray(data.nodes) ? data.nodes : [],
        edges: Array.isArray(data.edges) ? data.edges : [],
      }
      await canvas.writeCanvas(path, canvasData)
      return ok({ written: true, path })
    },
  )
}
