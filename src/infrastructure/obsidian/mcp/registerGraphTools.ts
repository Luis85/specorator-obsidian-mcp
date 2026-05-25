import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { MetadataCachePort, VaultPort } from '@/domain/ports'
import { normalizeVaultPath, isVaultRoot } from '@/domain/shared/VaultPath'
import { computeGraphStats, findOrphans, findDeadends } from '@/application/mcp/graph'
import { okStructured, err } from './shared'

export function registerGraphTools(
  server: McpServer,
  deps: { vault: VaultPort; metadata: MetadataCachePort },
): void {
  const { vault, metadata } = deps

  // ── graph.stats ─────────────────────────────────────────────────────────

  server.registerTool(
    'graph.stats',
    {
      description:
        'Server-side graph analysis. Returns note count, directed link count, connected components, orphan count, dead-end count, top-10 hubs by in-degree, and orphan percentage. Optionally scoped to a folder.',
      inputSchema: {
        folder: z
          .string()
          .optional()
          .describe('Vault-relative folder to analyse (default: vault root).'),
      },
      outputSchema: {
        totalNotes: z.number().int(),
        totalLinks: z.number().int(),
        components: z.number().int(),
        orphans: z.number().int(),
        deadends: z.number().int(),
        hubs: z.array(
          z.object({
            path: z.string(),
            inDegree: z.number().int(),
          }),
        ),
        orphanPercent: z.number(),
      },
    },
    async ({ folder = '' }) => {
      if (!isVaultRoot(folder)) {
        const norm = normalizeVaultPath(folder)
        if (!norm.ok) return err(`unsafe path: ${norm.error.message}`)
        const stats = await computeGraphStats({ vault, metadata }, norm.value)
        return okStructured(stats as unknown as Record<string, unknown>)
      }
      const stats = await computeGraphStats({ vault, metadata }, '')
      return okStructured(stats as unknown as Record<string, unknown>)
    },
  )

  // ── graph.orphans ────────────────────────────────────────────────────────

  server.registerTool(
    'graph.orphans',
    {
      description:
        'List notes with zero in-links (orphans). Optionally filter to notes not modified in the last N days (staleDays).',
      inputSchema: {
        folder: z
          .string()
          .optional()
          .describe('Vault-relative folder to scan (default: vault root).'),
        staleDays: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Filter to notes not modified in N days.'),
      },
      outputSchema: {
        orphans: z.array(
          z.object({
            path: z.string(),
            lastModified: z.string(),
            bytes: z.number().int(),
          }),
        ),
        count: z.number().int(),
      },
    },
    async ({ folder = '', staleDays }) => {
      if (!isVaultRoot(folder)) {
        const norm = normalizeVaultPath(folder)
        if (!norm.ok) return err(`unsafe path: ${norm.error.message}`)
        const result = await findOrphans({ vault, metadata }, norm.value, staleDays)
        return okStructured(result as unknown as Record<string, unknown>)
      }
      const result = await findOrphans({ vault, metadata }, '', staleDays)
      return okStructured(result as unknown as Record<string, unknown>)
    },
  )

  // ── graph.deadends ───────────────────────────────────────────────────────

  server.registerTool(
    'graph.deadends',
    {
      description:
        'List notes with zero outgoing links to other vault notes (dead-ends). Optionally scoped to a folder.',
      inputSchema: {
        folder: z
          .string()
          .optional()
          .describe('Vault-relative folder to scan (default: vault root).'),
      },
      outputSchema: {
        deadends: z.array(z.string()),
        count: z.number().int(),
      },
    },
    async ({ folder = '' }) => {
      if (!isVaultRoot(folder)) {
        const norm = normalizeVaultPath(folder)
        if (!norm.ok) return err(`unsafe path: ${norm.error.message}`)
        const result = await findDeadends({ vault, metadata }, norm.value)
        return okStructured(result as unknown as Record<string, unknown>)
      }
      const result = await findDeadends({ vault, metadata }, '')
      return okStructured(result as unknown as Record<string, unknown>)
    },
  )
}
