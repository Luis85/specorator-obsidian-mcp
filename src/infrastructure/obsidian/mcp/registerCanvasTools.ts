import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { CanvasPort, VaultPort } from '@/domain/ports'
import type { PermissionGate } from '@/application/mcp/PermissionGate'
import { normalizeVaultPath } from '@/domain/shared/VaultPath'
import { ok, okStructured, deny, err, collectFiles } from './shared'

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
  deps: { canvas: CanvasPort; gate: PermissionGate; vault: VaultPort },
): void {
  const { canvas, gate, vault } = deps

  server.registerTool(
    'canvas.read',
    {
      description: 'Read a JSON Canvas file (.canvas) — returns { nodes, edges }',
      inputSchema: { path: z.string().describe('Vault-relative .canvas path') },
      outputSchema: {
        canvas: z.object({
          nodes: z.array(CanvasNodeSchema),
          edges: z.array(CanvasEdgeSchema),
        }),
      },
    },
    async ({ path }) => {
      const norm = normalizeVaultPath(path)
      if (!norm.ok) return unsafePath(norm.error.message)
      return okStructured({ canvas: await canvas.readCanvas(norm.value) })
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

  server.registerTool(
    'canvas.list',
    {
      description:
        'List all canvas files in the vault or under a folder. Returns vault-relative .canvas file paths.',
      inputSchema: {
        folder: z
          .string()
          .optional()
          .describe("Vault-relative folder to scope the search. Omit or use '' for vault root."),
      },
      outputSchema: { canvases: z.array(z.string()) },
    },
    async ({ folder }) => {
      let rootFolder = ''
      if (folder !== undefined && folder !== '' && folder !== '/') {
        const norm = normalizeVaultPath(folder)
        if (!norm.ok) return unsafePath(norm.error.message)
        rootFolder = norm.value
      }
      const allFiles = await collectFiles(vault, rootFolder)
      const canvases = allFiles.filter((f) => f.endsWith('.canvas'))
      return okStructured({ canvases })
    },
  )
}
