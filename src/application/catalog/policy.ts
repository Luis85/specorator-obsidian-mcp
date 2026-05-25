export const MCP_PREFIX = 'mcp__specorator-obsidian-mcp__'

export const DESTRUCTIVE = [
  'vault_write',
  'vault_delete',
  'vault_move',
  'vault_createFolder',
  'canvas_write',
  'cli_execute',
  'cli_run',
  // v0.x write/mutation tools (server-gated mode=ask, never auto-granted)
  'frontmatter_set',
  'note_patch',
  'tags_rename',
  'bases_create',
] as const

/** Read-only allowlist (baseline least-privilege profile). */
export const DEFAULT_PROFILE = [
  // file reads / enumeration
  'vault_read',
  'vault_list',
  'vault_exists',
  'vault_walk',
  'vault_list_recursive',
  'vault_search',
  'vault_hash',
  // links + graph (read-only analysis, v0.x aggregates)
  'links_backlinks',
  'links_outgoing',
  'links_bfs',
  'links_unresolved',
  'graph_orphans',
  'graph_deadends',
  'graph_stats',
  // metadata
  'metadata_frontmatter',
  'metadata_headings',
  'metadata_tags',
  'metadata_linkpath',
  'metadata_search',
  'frontmatter_query',
  // canvas + bases (read)
  'canvas_read',
  'canvas_list',
  'bases_list',
  'bases_query',
  'bases_read',
  'bases_views',
  // audit (read-only reports)
  'audit_report',
  'attachments_orphans',
  // cli reads
  'cli_read_find',
  'cli_read_list',
] as const
// NOTE: `bases_filter` removed (no longer a tool) — frontmatter filtering is `frontmatter_query`.

const DESTRUCTIVE_SET = new Set<string>(DESTRUCTIVE as readonly string[])

export function partitionTools(tools: string[]): { allowed: string[]; destructive: string[] } {
  return {
    allowed: tools.filter((t) => !DESTRUCTIVE_SET.has(t)),
    destructive: tools.filter((t) => DESTRUCTIVE_SET.has(t)),
  }
}

/** Fully-qualify a bare MCP tool name to the canonical prefix (Decision 1). */
export function qualify(tool: string): string {
  return `${MCP_PREFIX}${tool}`
}

/**
 * Least-privilege `allowed-tools` value: only the asset's non-destructive
 * requires, fully qualified. Destructive tools are default-denied here and must
 * be surfaced for explicit consent instead (see installer/consent path).
 */
export function allowedToolsLine(requires: string[]): string {
  // R5: grant only the asset's non-destructive requires that are ALSO in the
  // read-only DEFAULT_PROFILE allowlist — so an unrecognized/typo'd tool is never
  // auto-granted. This makes DEFAULT_PROFILE load-bearing, not decorative.
  const profile = new Set<string>(DEFAULT_PROFILE as readonly string[])
  const { allowed } = partitionTools(requires)
  return allowed
    .filter((t) => profile.has(t))
    .map(qualify)
    .join(', ')
}
