export type ToolMode = 'allow' | 'ask' | 'deny'
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
/** Workflow Catalog — platforms the user has opted into. */
export type CatalogPlatform = 'claude' | 'cursor' | 'codex' | 'gemini'

export interface AutoRegisterSettings {
  claudeCli: boolean
  cursor: boolean
  claudeDesktop: boolean
}

export interface PluginSettings {
  port: number
  defaultMode: ToolMode
  toolModes: Record<string, ToolMode>
  pathDenyList: string[]
  askTimeoutMs: number
  logLevel: LogLevel
  autoRegister: AutoRegisterSettings
  /** Command-id prefixes (e.g. "editor:") that bypass the ask-gate for cli.execute. */
  cliExecuteAllowedPrefixes: string[]
  /** CLI command-name prefixes (e.g. "version", "search", "base:") that bypass the ask-gate for cli.run. Kept separate from cliExecuteAllowedPrefixes — cli.run invokes the external binary and has a wider attack surface (e.g. eval). */
  cliRunAllowedPrefixes: string[]
  /** Path to the `obsidian` CLI binary. Empty string = auto-resolve (PATH > platform defaults). */
  obsidianBinPath: string
  /**
   * When true, the MCP server registers the `cli.eval` tool which executes
   * arbitrary JavaScript in Obsidian's renderer context. Default false.
   * Requires a server restart after toggling.
   */
  developerMode: boolean
  /** Workflow Catalog — platforms the user has opted into for catalog installs. */
  platforms: CatalogPlatform[]
  /**
   * When true, the MCP server starts automatically when Obsidian loads this
   * plugin. Default false — user must explicitly opt in.
   */
  autoStart: boolean
}

export const DEFAULT_TOOL_MODES: Readonly<Record<string, ToolMode>> = Object.freeze({
  // vault
  'vault.createFolder': 'ask',
  'vault.delete': 'ask',
  'vault.exists': 'allow',
  'vault.hash': 'allow',
  'vault.list': 'allow',
  'vault.list_recursive': 'allow',
  'vault.move': 'ask',
  'vault.read': 'allow',
  'vault.search': 'allow',
  'vault.walk': 'allow',
  'vault.write': 'ask',

  // metadata
  'metadata.frontmatter': 'allow',
  'metadata.headings': 'allow',
  'metadata.linkpath': 'allow',
  'metadata.search': 'allow',
  'metadata.tags': 'allow',

  // frontmatter
  'frontmatter.query': 'allow',
  'frontmatter.set': 'ask',

  // note
  'note.patch': 'ask',

  // links
  'links.backlinks': 'allow',
  'links.bfs': 'allow',
  'links.outgoing': 'allow',
  'links.unresolved': 'allow',

  // graph
  'graph.deadends': 'allow',
  'graph.orphans': 'allow',
  'graph.stats': 'allow',

  // tags
  'tags.rename': 'ask',

  // attachments
  'attachments.orphans': 'allow',

  // canvas
  'canvas.list': 'allow',
  'canvas.read': 'allow',
  'canvas.write': 'ask',

  // bases
  'bases.create': 'ask',
  'bases.list': 'allow',
  'bases.query': 'allow',
  'bases.read': 'allow',
  'bases.views': 'allow',

  // cli
  'cli.daily_note': 'ask',
  'cli.eval': 'deny',
  'cli.execute': 'deny',
  'cli.open_file': 'ask',
  'cli.read.find': 'allow',
  'cli.read.list': 'allow',
  'cli.reload': 'ask',
  'cli.run': 'deny',
  'cli.screenshot': 'ask',
  'cli.template_insert': 'ask',
  'cli.workspace_load': 'ask',

  // audit
  'audit.diff': 'allow',
  'audit.export': 'ask',
  'audit.report': 'allow',
  'audit.tail': 'allow',

  // vault stats
  'vault.stats': 'allow',
})

export const DEFAULT_AUTO_REGISTER: AutoRegisterSettings = Object.freeze({
  claudeCli: true,
  cursor: false,
  claudeDesktop: false,
})

export const DEFAULT_SETTINGS: PluginSettings = {
  port: 7842,
  defaultMode: 'ask',
  toolModes: { ...DEFAULT_TOOL_MODES },
  pathDenyList: ['.specorator/**', '.claude/hooks/**', '.claude/hooks/hooks.json'],
  askTimeoutMs: 30_000,
  logLevel: 'warn',
  autoRegister: { ...DEFAULT_AUTO_REGISTER },
  cliExecuteAllowedPrefixes: [],
  cliRunAllowedPrefixes: [],
  obsidianBinPath: '',
  developerMode: false,
  platforms: ['claude'],
  autoStart: false,
}
