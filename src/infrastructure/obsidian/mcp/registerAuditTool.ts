import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { MetadataCachePort, VaultPort } from '@/domain/ports'
import { normalizeVaultPath } from '@/domain/shared/VaultPath'
import { auditVault, ALL_CHECKS } from '@/application/mcp/audit'
import { ok, okStructured, err } from './shared'

const CHECKS_ENUM = z.enum([
  'orphans',
  'deadends',
  'unresolved_links',
  'empty_notes',
  'large_files',
  'tag_dupes',
])

export function registerAuditTool(
  server: McpServer,
  deps: { vault: VaultPort; metadata: MetadataCachePort },
): void {
  const { vault, metadata } = deps

  server.registerTool(
    'audit.report',
    {
      description:
        'One-shot vault health snapshot. Runs server-side — O(1) call regardless of vault size. Returns orphans, dead-ends, unresolved wikilinks, empty notes, large files, and tag duplicates.',
      inputSchema: {
        folder: z
          .string()
          .optional()
          .describe('Vault-relative folder to audit (default: vault root).'),
        checks: z.array(CHECKS_ENUM).optional().describe('Subset of checks to run (default: all).'),
        sizeThresholdBytes: z
          .number()
          .int()
          .min(1024)
          .optional()
          .default(1_000_000)
          .describe('Byte threshold for large_files check (default: 1 MB).'),
      },
      outputSchema: {
        folder: z.string(),
        totalFiles: z.number().int(),
        checksRun: z.array(z.string()),
        findings: z.object({
          orphans: z.array(z.string()).optional(),
          deadends: z.array(z.string()).optional(),
          unresolved_links: z
            .array(z.object({ source: z.string(), target: z.string() }))
            .optional(),
          empty_notes: z.array(z.string()).optional(),
          large_files: z
            .array(z.object({ path: z.string(), bytes: z.number() }))
            .optional(),
          tag_dupes: z
            .array(z.object({ canonical: z.string(), variants: z.array(z.string()) }))
            .optional(),
        }),
        counts: z.record(z.string(), z.number().int()),
      },
    },
    async ({ folder = '', checks, sizeThresholdBytes = 1_000_000 }) => {
      const norm = normalizeVaultPath(folder)
      if (!norm.ok) return err(`unsafe path: ${norm.error.message}`)

      const checksToRun = checks !== undefined && checks.length > 0 ? checks : [...ALL_CHECKS]

      const result = await auditVault(
        { vault, metadata },
        norm.value,
        checksToRun,
        sizeThresholdBytes,
      )

      return okStructured(result as unknown as Record<string, unknown>)
    },
  )
}
