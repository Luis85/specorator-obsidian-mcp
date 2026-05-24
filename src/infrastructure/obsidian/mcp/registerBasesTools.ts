import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { VaultPort } from '@/domain/ports'
import { normalizeVaultPath } from '@/domain/shared/VaultPath'
import { collectFiles, ok, parseFrontmatter } from './shared'

function unsafePath(msg: string): { isError: true; content: [{ type: 'text'; text: string }] } {
  return { isError: true, content: [{ type: 'text' as const, text: `unsafe path: ${msg}` }] }
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
  value: z.unknown(),
})

export function registerBasesTools(server: McpServer, deps: { vault: VaultPort }): void {
  const { vault } = deps

  server.registerTool(
    'bases.list',
    {
      description:
        'List all frontmatter records in a folder (recursively). Returns { records: [{ path, frontmatter }] }.',
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

  server.registerTool(
    'bases.filter',
    {
      description:
        'Filter frontmatter records in a folder by a field condition. op: eq|neq|contains|in.',
      inputSchema: {
        folder: z.string().describe('Vault-relative folder to scan recursively'),
        filter: FilterSchema.describe('Field filter condition'),
      },
    },
    async ({ folder, filter }) => {
      const norm = normalizeVaultPath(folder)
      if (!norm.ok) return unsafePath(norm.error.message)
      const records = await loadBaseRecords(vault, norm.value)
      const matched = records.filter((r) =>
        matchesFilter(r.frontmatter[filter.field], filter.op, filter.value),
      )
      return ok({ records: matched })
    },
  )
}
