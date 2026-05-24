export type ToolMode = 'allow' | 'ask' | 'deny'
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface PluginSettings {
  port: number
  defaultMode: ToolMode
  toolModes: Record<string, ToolMode>
  pathDenyList: string[]
  askTimeoutMs: number
  logLevel: LogLevel
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
})

export const DEFAULT_SETTINGS: PluginSettings = {
  port: 7842,
  defaultMode: 'ask',
  toolModes: { ...DEFAULT_TOOL_MODES },
  pathDenyList: [],
  askTimeoutMs: 30_000,
  logLevel: 'warn',
}
