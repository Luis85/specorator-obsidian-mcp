import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { VaultPort, MetadataCachePort } from '@/domain/ports'
import type { PermissionGate } from '@/application/mcp/PermissionGate'
import { normalizeVaultPath, isVaultRoot } from '@/domain/shared/VaultPath'
import { renameTagInContent } from '@/application/mcp/tagsRename'
import { isTextFile, computeOrphans } from '@/application/mcp/attachments'
import { auditVault, ALL_CHECKS } from '@/application/mcp/audit'
import { formatAuditMarkdown } from '@/application/mcp/auditExport'
import { collectFiles, okStructured, deny, err } from './shared'

const CHECKS_ENUM = z.enum([
  'orphans',
  'deadends',
  'unresolved_links',
  'empty_notes',
  'large_files',
  'tag_dupes',
])

export function registerRemediationTools(
  server: McpServer,
  deps: { vault: VaultPort; metadata: MetadataCachePort; gate: PermissionGate },
): void {
  const { vault, metadata, gate } = deps

  // -------------------------------------------------------------------------
  // tags.rename
  // -------------------------------------------------------------------------
  server.registerTool(
    'tags.rename',
    {
      description:
        'Bulk rename a tag across all vault notes. ' +
        'Replaces inline #tag occurrences and frontmatter tags: array entries. ' +
        'Default dryRun=true returns the plan without writing. ' +
        'Set dryRun=false to apply changes.',
      inputSchema: {
        oldTag: z.string().min(1).describe('Tag to rename (with or without leading #)'),
        newTag: z.string().min(1).describe('Replacement tag (with or without leading #)'),
        folder: z
          .string()
          .optional()
          .describe('Vault-relative folder to limit the scan (default: vault root)'),
        dryRun: z
          .boolean()
          .default(true)
          .describe('When true (default), report changes without writing'),
      },
      outputSchema: {
        changed: z.array(z.object({ path: z.string(), occurrences: z.number().int() })),
        totalChanges: z.number().int(),
        dryRun: z.boolean(),
      },
    },
    async ({ oldTag, newTag, folder, dryRun }) => {
      // Resolve folder
      let searchRoot = ''
      if (folder !== undefined && !isVaultRoot(folder)) {
        const norm = normalizeVaultPath(folder)
        if (!norm.ok) return err(`unsafe path: ${norm.error.message}`)
        searchRoot = norm.value
      }

      const d = await gate.resolve('tags.rename', { oldTag, newTag, folder: searchRoot })
      if (d.decision === 'deny') return deny(d.reason)

      const allFiles = await collectFiles(vault, searchRoot)
      const mdFiles = allFiles.filter((f) => f.endsWith('.md'))

      const changed: Array<{ path: string; occurrences: number; newContent: string }> = []

      for (const path of mdFiles) {
        let content: string
        try {
          content = await vault.readFile(path)
        } catch {
          continue
        }
        const result = renameTagInContent(content, oldTag, newTag)
        if (result !== null) {
          changed.push({ path, occurrences: result.occurrences, newContent: result.newContent })
        }
      }

      if (!dryRun) {
        for (const { path, newContent } of changed) {
          await vault.writeFile(path, newContent)
        }
      }

      const totalChanges = changed.reduce((sum, f) => sum + f.occurrences, 0)
      return okStructured({
        changed: changed.map(({ path, occurrences }) => ({ path, occurrences })),
        totalChanges,
        dryRun,
      })
    },
  )

  // -------------------------------------------------------------------------
  // attachments.orphans
  // -------------------------------------------------------------------------
  server.registerTool(
    'attachments.orphans',
    {
      description:
        'Find unreferenced media files (non-.md/.canvas/.base) in the vault. ' +
        'Scans all text files for ![[...]] wikilink embeds and ![alt](path) markdown embeds. ' +
        'Media files not referenced in any text file are returned as orphans.',
      inputSchema: {
        folder: z
          .string()
          .optional()
          .describe('Vault-relative folder to limit the scan (default: vault root)'),
      },
      outputSchema: {
        orphans: z.array(z.object({ path: z.string(), bytes: z.number().int() })),
        count: z.number().int(),
        totalBytes: z.number().int(),
      },
    },
    async ({ folder }) => {
      let searchRoot = ''
      if (folder !== undefined && !isVaultRoot(folder)) {
        const norm = normalizeVaultPath(folder)
        if (!norm.ok) return err(`unsafe path: ${norm.error.message}`)
        searchRoot = norm.value
      }

      const allFiles = await collectFiles(vault, searchRoot)

      // Read content of all text files
      const contentMap = new Map<string, string>()
      for (const path of allFiles) {
        if (!isTextFile(path)) continue
        try {
          const content = await vault.readFile(path)
          contentMap.set(path, content)
        } catch {
          // skip unreadable files
        }
      }

      // Collect stats (bytes) for media files
      const statsMap = new Map<string, number>()
      for (const path of allFiles) {
        if (isTextFile(path)) continue
        const stats = await vault.getFileStats(path)
        statsMap.set(path, stats?.size ?? 0)
      }

      const orphans = computeOrphans(allFiles, contentMap, statsMap)
      const totalBytes = orphans.reduce((sum, o) => sum + o.bytes, 0)

      return okStructured({ orphans, count: orphans.length, totalBytes })
    },
  )

  // -------------------------------------------------------------------------
  // audit.export
  // -------------------------------------------------------------------------
  server.registerTool(
    'audit.export',
    {
      description:
        'Run a vault audit and write the results as a Markdown report to the vault. ' +
        'Optionally also writes a JSON baseline file for comparison via audit.diff. ' +
        'Requires permission because it writes files to the vault.',
      inputSchema: {
        folder: z
          .string()
          .optional()
          .describe('Vault-relative folder to audit (default: vault root)'),
        checks: z.array(CHECKS_ENUM).optional().describe('Subset of checks to run (default: all)'),
        sizeThresholdBytes: z
          .number()
          .int()
          .min(1024)
          .optional()
          .default(1_000_000)
          .describe('Byte threshold for large_files check (default: 1 MB)'),
        reportPath: z
          .string()
          .describe('Vault-relative path to write the Markdown report (e.g. "audit/report.md")'),
        baselinePath: z
          .string()
          .optional()
          .describe(
            'Vault-relative path to write the raw JSON baseline (e.g. "audit/baseline.json"). Optional.',
          ),
      },
      outputSchema: {
        reportPath: z.string(),
        baselinePath: z.string().optional(),
        bytesWritten: z.number().int(),
        findings: z.record(z.string(), z.number().int()),
      },
    },
    async ({ folder = '', checks, sizeThresholdBytes = 1_000_000, reportPath, baselinePath }) => {
      // Validate audit folder
      let auditRoot = ''
      if (!isVaultRoot(folder)) {
        const normFolder = normalizeVaultPath(folder)
        if (!normFolder.ok) return err(`unsafe path (folder): ${normFolder.error.message}`)
        auditRoot = normFolder.value
      }

      // Validate reportPath
      const normReport = normalizeVaultPath(reportPath)
      if (!normReport.ok) return err(`unsafe path (reportPath): ${normReport.error.message}`)
      const safeReportPath = normReport.value

      // Validate baselinePath
      let safeBaselinePath: string | undefined
      if (baselinePath !== undefined) {
        const normBaseline = normalizeVaultPath(baselinePath)
        if (!normBaseline.ok)
          return err(`unsafe path (baselinePath): ${normBaseline.error.message}`)
        safeBaselinePath = normBaseline.value
      }

      // Permission gate — the write paths are what matters here
      const d = await gate.resolve('audit.export', {
        path: safeReportPath,
        folder: auditRoot,
      })
      if (d.decision === 'deny') return deny(d.reason)

      const checksToRun = checks !== undefined && checks.length > 0 ? checks : [...ALL_CHECKS]

      const result = await auditVault(
        { vault, metadata },
        auditRoot,
        checksToRun,
        sizeThresholdBytes,
      )

      const markdown = formatAuditMarkdown(result)
      await vault.writeFile(safeReportPath, markdown)

      const encoder = new TextEncoder()
      let bytesWritten = encoder.encode(markdown).length

      if (safeBaselinePath !== undefined) {
        const json = JSON.stringify(result, null, 2)
        await vault.writeFile(safeBaselinePath, json)
        bytesWritten += encoder.encode(json).length
      }

      return okStructured({
        reportPath: safeReportPath,
        baselinePath: safeBaselinePath,
        bytesWritten,
        findings: result.counts,
      })
    },
  )

  // -------------------------------------------------------------------------
  // audit.diff
  // -------------------------------------------------------------------------
  server.registerTool(
    'audit.diff',
    {
      description:
        'Compare current audit findings against a previously saved JSON baseline (from audit.export). Returns added/resolved/unchanged for each check category.',
      inputSchema: {
        baselinePath: z
          .string()
          .describe('Vault-relative path to a JSON baseline previously written by audit.export'),
        folder: z.string().optional(),
        checks: z.array(CHECKS_ENUM).optional(),
        sizeThresholdBytes: z.number().int().min(1024).optional().default(1_000_000),
      },
      outputSchema: {
        baselinePath: z.string(),
        generatedAt: z.string(),
        checks: z.record(
          z.string(),
          z.object({
            added: z.array(z.string()),
            resolved: z.array(z.string()),
            unchanged: z.number().int(),
          }),
        ),
      },
    },
    async ({ baselinePath, folder, checks, sizeThresholdBytes = 1_000_000 }) => {
      const norm = normalizeVaultPath(baselinePath)
      if (!norm.ok) return err(`unsafe path: ${norm.error.message}`)

      const baselineRaw = await vault.readFile(norm.value).catch(() => null)
      if (baselineRaw === null) return err(`baseline not found: ${norm.value}`)

      let baseline: { findings?: Record<string, unknown[]> }
      try {
        baseline = JSON.parse(baselineRaw) as { findings?: Record<string, unknown[]> }
      } catch (e) {
        return err(`baseline JSON parse error: ${(e as Error).message}`)
      }

      let auditRoot = ''
      if (folder !== undefined && !isVaultRoot(folder)) {
        const normFolder = normalizeVaultPath(folder)
        if (!normFolder.ok) return err(`unsafe path (folder): ${normFolder.error.message}`)
        auditRoot = normFolder.value
      }

      const checksToRun = checks !== undefined && checks.length > 0 ? checks : [...ALL_CHECKS]

      const current = await auditVault(
        { vault, metadata },
        auditRoot,
        checksToRun,
        sizeThresholdBytes,
      )

      const diff: Record<string, { added: string[]; resolved: string[]; unchanged: number }> = {}
      for (const check of current.checksRun) {
        const baselineList = normaliseFindingPaths(
          (baseline.findings?.[check] as unknown[] | undefined) ?? [],
        )
        const currentList = normaliseFindingPaths(
          ((current.findings as Record<string, unknown>)[check] as unknown[] | undefined) ?? [],
        )
        const baselineSet = new Set(baselineList)
        const currentSet = new Set(currentList)
        const added = currentList.filter((p) => !baselineSet.has(p))
        const resolved = baselineList.filter((p) => !currentSet.has(p))
        const unchanged = currentList.filter((p) => baselineSet.has(p)).length
        diff[check] = { added, resolved, unchanged }
      }

      return okStructured({
        baselinePath: norm.value,
        generatedAt: new Date().toISOString(),
        checks: diff,
      })
    },
  )
}

function normaliseFindingPaths(items: unknown[]): string[] {
  return items.map((item) => {
    if (typeof item === 'string') return item
    if (typeof item === 'object' && item !== null) {
      const obj = item as Record<string, unknown>
      if (typeof obj.path === 'string') return obj.path
      if (typeof obj.source === 'string' && typeof obj.target === 'string')
        return `${obj.source} → ${obj.target}`
    }
    return JSON.stringify(item)
  })
}
