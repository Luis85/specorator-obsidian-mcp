import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { VaultPort } from '@/domain/ports'
import { normalizeVaultPath } from '@/domain/shared/VaultPath'
import { collectFiles, ok, err, parseFrontmatter } from './shared'

function unsafePath(msg: string): { isError: true; content: [{ type: 'text'; text: string }] } {
  return err(`unsafe path: ${msg}`)
}

type FilterOp = 'eq' | 'neq' | 'contains' | 'in'

function matchesFilter(value: unknown, op: FilterOp, target: unknown): boolean {
  switch (op) {
    case 'eq':
      return value === target
    case 'neq':
      return value !== target
    case 'contains':
      if (typeof value === 'string' && typeof target === 'string') return value.includes(target)
      if (Array.isArray(value)) return value.includes(target)
      return false
    case 'in':
      return Array.isArray(target) && target.includes(value)
  }
}

interface BaseRecord {
  path: string
  frontmatter: Record<string, unknown>
}

async function loadBaseRecords(vault: VaultPort, folder: string): Promise<BaseRecord[]> {
  const files = (await collectFiles(vault, folder)).filter((p) => p.endsWith('.md'))
  const records = await Promise.all(
    files.map(async (path) => {
      try {
        const content = await vault.readFile(path)
        return { path, frontmatter: parseFrontmatter(content) }
      } catch {
        return null
      }
    }),
  )
  return records.filter((r): r is BaseRecord => r !== null)
}

const FilterSchema = z.object({
  field: z.string(),
  op: z.enum(['eq', 'neq', 'contains', 'in']),
  value: z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.unknown())]),
})

export function registerBasesTools(server: McpServer, deps: { vault: VaultPort }): void {
  const { vault } = deps

  server.registerTool(
    'bases.list',
    {
      description:
        'Scans recursively for Obsidian Bases. Returns { records: [{ path, frontmatter }] }. On large vaults (>1000 notes) prefer bases.filter to narrow the scan.',
      inputSchema: {
        folder: z.string().describe('Vault-relative folder to scan recursively'),
      },
    },
    async ({ folder }) => {
      const norm = normalizeVaultPath(folder)
      if (!norm.ok) return unsafePath(norm.error.message)
      const records = await loadBaseRecords(vault, norm.value)
      return ok({ records })
    },
  )

  const FiltersInput = z.union([
    FilterSchema, // single (back-compat)
    z.array(FilterSchema).min(1), // multiple, AND
  ])

  server.registerTool(
    'bases.filter',
    {
      description:
        'Filter Obsidian Bases records by one or more field/op/value criteria. Multiple filters combine with AND semantics.',
      inputSchema: {
        folder: z.string().describe('Vault-relative folder to scan recursively'),
        filters: FiltersInput.describe(
          'One filter object OR an array of filter objects (AND semantics)',
        ),
      },
    },
    async ({ folder, filters }) => {
      const norm = normalizeVaultPath(folder)
      if (!norm.ok) return unsafePath(norm.error.message)
      const records = await loadBaseRecords(vault, norm.value)
      // Normalise to array
      const filterArray = Array.isArray(filters) ? filters : [filters]
      const matched = records.filter((r) =>
        filterArray.every((f) => matchesFilter(r.frontmatter[f.field], f.op, f.value)),
      )
      return ok({ records: matched })
    },
  )
}
