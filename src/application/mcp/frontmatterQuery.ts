/**
 * Pure-domain frontmatter query helper.
 *
 * Walks the vault, parses frontmatter from the metadata cache, and applies
 * compound AND/OR filter conditions. No CLI shelling; no external dependencies.
 */
import type { MetadataCachePort } from '@/domain/ports/MetadataCachePort'
import type { VaultPort } from '@/domain/ports/VaultPort'

// ── types ────────────────────────────────────────────────────────────────────

export type ConditionOp = 'eq' | 'neq' | 'contains' | 'in' | 'exists' | 'gt' | 'lt'

export interface Condition {
  field: string
  op: ConditionOp
  value?: string | number | boolean | null | unknown[]
}

export interface FrontmatterQueryResult {
  matches: Array<{ path: string; frontmatter: Record<string, unknown> }>
  count: number
}

// ── shared file collector ────────────────────────────────────────────────────

function joinPath(parent: string, child: string): string {
  const p = parent.replace(/\/+$/, '')
  return p ? `${p}/${child}` : child
}

async function collectAllFiles(vault: VaultPort, folder: string): Promise<string[]> {
  const [files, subfolders] = await Promise.all([
    vault.listFiles(folder),
    vault.listFolders(folder),
  ])
  const nested = await Promise.all(
    subfolders.map((sub) => collectAllFiles(vault, joinPath(folder, sub))),
  )
  return [...files, ...nested.flat()]
}

// ── condition evaluator ──────────────────────────────────────────────────────

function evalCondition(fm: Record<string, unknown>, cond: Condition): boolean {
  const { field, op, value } = cond
  const fieldValue = fm[field]

  switch (op) {
    case 'exists':
      return Object.prototype.hasOwnProperty.call(fm, field)

    case 'eq':
      return fieldValue === value

    case 'neq':
      return fieldValue !== value

    case 'contains': {
      if (typeof fieldValue === 'string' && typeof value === 'string') {
        return fieldValue.includes(value)
      }
      if (Array.isArray(fieldValue)) {
        return fieldValue.includes(value)
      }
      return false
    }

    case 'in': {
      if (!Array.isArray(value)) return false
      return value.includes(fieldValue)
    }

    case 'gt': {
      if (typeof fieldValue !== 'number' || typeof value !== 'number') return false
      return fieldValue > value
    }

    case 'lt': {
      if (typeof fieldValue !== 'number' || typeof value !== 'number') return false
      return fieldValue < value
    }

    default:
      return false
  }
}

// ── public query helper ──────────────────────────────────────────────────────

export async function queryFrontmatter(
  deps: { vault: VaultPort; metadata: MetadataCachePort },
  folder: string,
  conditions: Condition[],
  combineOp: 'AND' | 'OR',
): Promise<FrontmatterQueryResult> {
  const { vault, metadata } = deps

  const allFiles = await collectAllFiles(vault, folder)
  const mdFiles = allFiles.filter((f) => f.endsWith('.md'))

  const matches: Array<{ path: string; frontmatter: Record<string, unknown> }> = []

  for (const path of mdFiles) {
    // Prefer metadata cache; fall back to null (no frontmatter)
    const snap = metadata.getFileMetadata(path)
    const fm: Record<string, unknown> = snap?.frontmatter ?? {}

    const results = conditions.map((c) => evalCondition(fm, c))
    const pass = combineOp === 'AND' ? results.every(Boolean) : results.some(Boolean)

    if (pass) {
      matches.push({ path, frontmatter: fm })
    }
  }

  return { matches, count: matches.length }
}
