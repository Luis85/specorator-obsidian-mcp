import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { VaultPort } from '@/domain/ports'
import { isVaultRoot, normalizeVaultPath } from '@/domain/shared/VaultPath'
import { collectFiles, okStructured, err } from './shared'

export function registerVaultStatsTool(server: McpServer, deps: { vault: VaultPort }): void {
  const { vault } = deps

  server.registerTool(
    'vault.stats',
    {
      description:
        'Return vault size statistics: total file count + total bytes + per-extension count and bytes. Lightweight (uses getFileStats, no content reads).',
      inputSchema: {
        folder: z
          .string()
          .optional()
          .describe('Vault-relative folder to scope the stats (default: vault root)'),
      },
      outputSchema: {
        totalFiles: z.number().int(),
        totalBytes: z.number().int(),
        byExtension: z.record(
          z.string(),
          z.object({
            count: z.number().int(),
            bytes: z.number().int(),
          }),
        ),
      },
    },
    async ({ folder }) => {
      let root = ''
      if (folder !== undefined && !isVaultRoot(folder)) {
        const norm = normalizeVaultPath(folder)
        if (!norm.ok) return err(`unsafe path: ${norm.error.message}`)
        root = norm.value
      }

      const files = await collectFiles(vault, root)
      let totalBytes = 0
      const byExt: Record<string, { count: number; bytes: number }> = {}

      // Yield every 100 files to avoid blocking on huge vaults
      const BATCH = 100
      for (let i = 0; i < files.length; i += BATCH) {
        const batch = files.slice(i, i + BATCH)
        await Promise.all(
          batch.map(async (path) => {
            const stats = await vault.getFileStats(path).catch(() => null)
            const size = stats?.size ?? 0
            totalBytes += size
            const dot = path.lastIndexOf('.')
            const ext = dot !== -1 ? path.slice(dot) : '<none>'
            const entry = byExt[ext] ?? { count: 0, bytes: 0 }
            entry.count++
            entry.bytes += size
            byExt[ext] = entry
          }),
        )
        // Yield to event loop after each batch
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }

      return okStructured({ totalFiles: files.length, totalBytes, byExtension: byExt })
    },
  )
}
