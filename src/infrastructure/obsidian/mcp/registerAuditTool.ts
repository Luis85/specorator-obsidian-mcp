import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { MetadataCachePort, VaultPort } from '@/domain/ports'
import { normalizeVaultPath } from '@/domain/shared/VaultPath'
import { auditVault, ALL_CHECKS, DEFAULT_MAX_FILES } from '@/application/mcp/audit'
import { okStructured, err } from './shared'

export function registerAuditTailTool(server: McpServer, deps: { vault: VaultPort }): void {
  server.registerTool(
    'audit.tail',
    {
      description:
        'Return the last N entries from the MCP audit log (.specorator/audit-log.jsonl). Useful for diagnosing permission decisions and tool-call history.',
      inputSchema: {
        n: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(50)
          .describe('Number of entries to return from the end of the log'),
      },
      outputSchema: {
        entries: z.array(z.record(z.string(), z.unknown())),
        count: z.number().int(),
      },
    },
    async ({ n }) => {
      const raw = await deps.vault.readFile('.specorator/audit-log.jsonl').catch(() => '')
      const lines = raw.split('\n').filter((l) => l.trim().length > 0)
      const tail = lines.slice(-n)
      const entries = tail.map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>
        } catch {
          return { invalid: line }
        }
      })
      return okStructured({ entries, count: entries.length })
    },
  )
}

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
  registerAuditTailTool(server, { vault })

  server.registerTool(
    'audit.report',
    {
      description:
        'One-shot vault health snapshot. Returns orphans, dead-ends, unresolved wikilinks, empty notes, large files, and tag duplicates. ' +
        `On very large vaults (>${DEFAULT_MAX_FILES} notes), the scan is capped at maxFiles (default ${DEFAULT_MAX_FILES}) and truncated:true is set in the response. ` +
        'Use checks:[...] to scope to a single check type for faster results (e.g. checks:["orphans"]).',
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
        maxFiles: z
          .number()
          .int()
          .min(1)
          .optional()
          .default(DEFAULT_MAX_FILES)
          .describe(
            `Maximum number of markdown files to audit (default: ${DEFAULT_MAX_FILES}). ` +
              'When the vault exceeds this limit, results are partial and truncated:true is returned.',
          ),
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
          large_files: z.array(z.object({ path: z.string(), bytes: z.number() })).optional(),
          tag_dupes: z
            .array(z.object({ canonical: z.string(), variants: z.array(z.string()) }))
            .optional(),
        }),
        counts: z.record(z.string(), z.number().int()),
        truncated: z.boolean().optional(),
      },
    },
    async ({
      folder = '',
      checks,
      sizeThresholdBytes = 1_000_000,
      maxFiles = DEFAULT_MAX_FILES,
    }) => {
      const norm = normalizeVaultPath(folder)
      if (!norm.ok) return err(`unsafe path: ${norm.error.message}`)

      const checksToRun = checks !== undefined && checks.length > 0 ? checks : [...ALL_CHECKS]

      const result = await auditVault(
        { vault, metadata },
        norm.value,
        checksToRun,
        sizeThresholdBytes,
        maxFiles,
      )

      return okStructured(result as unknown as Record<string, unknown>)
    },
  )
}
