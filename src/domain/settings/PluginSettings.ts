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
  'vault.read': 'allow',
  'vault.list': 'allow',
  'vault.exists': 'allow',
  'vault.write': 'ask',
  'vault.delete': 'ask',
  'vault.move': 'ask',
  'vault.createFolder': 'ask',
  'metadata.frontmatter': 'allow',
  'metadata.tags': 'allow',
  'metadata.headings': 'allow',
  'metadata.linkpath': 'allow',
  'links.backlinks': 'allow',
  'links.outgoing': 'allow',
  'links.bfs': 'allow',
  'canvas.read': 'allow',
  'canvas.write': 'ask',
  'bases.list': 'allow',
  'bases.views': 'allow',
  'bases.query': 'allow',
  'bases.read': 'allow',
  'bases.create': 'ask',
  'cli.read.list': 'allow',
  'cli.read.find': 'allow',
  'cli.execute': 'deny',
  'cli.screenshot': 'ask',
  'cli.run': 'deny',
  'vault.search': 'allow',
  'vault.list_recursive': 'allow',
  'metadata.search': 'allow',
  'canvas.list': 'allow',
  'cli.daily_note': 'ask',
  'cli.workspace_load': 'ask',
  'cli.template_insert': 'ask',
  'cli.open_file': 'ask',
  'cli.reload': 'ask',
  'cli.eval': 'deny',
  'audit.report': 'allow',
  'links.unresolved': 'allow',
  'frontmatter.set': 'ask',
  'graph.stats': 'allow',
  'graph.orphans': 'allow',
  'graph.deadends': 'allow',
  'frontmatter.query': 'allow',
  'vault.walk': 'allow',
  'note.patch': 'ask',
  'vault.hash': 'allow',
  'tags.rename': 'ask',
  'attachments.orphans': 'allow',
  'audit.export': 'ask',
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
