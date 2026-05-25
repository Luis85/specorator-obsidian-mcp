export type ToolMode = 'allow' | 'ask' | 'deny'
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

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
  /** Path to the `obsidian` CLI binary. Empty string = auto-resolve (PATH > platform defaults). */
  obsidianBinPath: string
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
  'bases.filter': 'allow',
  'cli.read.list': 'allow',
  'cli.read.find': 'allow',
  'cli.execute': 'deny',
  'vault.search': 'allow',
  'vault.list_recursive': 'allow',
  'metadata.search': 'allow',
  'canvas.list': 'allow',
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
  pathDenyList: [],
  askTimeoutMs: 30_000,
  logLevel: 'warn',
  autoRegister: { ...DEFAULT_AUTO_REGISTER },
  cliExecuteAllowedPrefixes: [],
  obsidianBinPath: '',
}
