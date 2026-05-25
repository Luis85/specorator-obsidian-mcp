export type AssetType = 'skill' | 'command' | 'agent' | 'hook'
export type Platform = 'claude' | 'cursor' | 'codex' | 'gemini'

export interface AssetMeta {
  id: string // == folder name, lowercase-hyphen
  name: string // frontmatter name
  description: string
  type: AssetType
  version: string // semver
  bundle: string
  requires: string[] // MCP tool names (bare, e.g. "links_backlinks")
  dependsOn: string[] // other asset ids
  body: string // markdown after frontmatter
}

export interface CatalogIndex {
  version: string
  assets: AssetMeta[]
}

export interface InstalledRecord {
  version: string
  platforms: Platform[]
  paths: string[] // vault-relative files written
  hash: string // sha256 of body at install time
  /** Fix 5 (PR #445 P1): persisted hook opt-in so bulk-update can restore it. */
  hookEnabled?: boolean
}

// Map assetId -> InstalledRecord
export type InstalledState = Record<string, InstalledRecord>

/** All vault I/O goes through this port so logic is testable in-memory. */
export interface FileSystem {
  read(path: string): Promise<string | null>
  write(path: string, content: string): Promise<void>
  exists(path: string): Promise<boolean>
  remove(path: string): Promise<void>
  mkdirp(path: string): Promise<void> // ensure parent dirs
}
