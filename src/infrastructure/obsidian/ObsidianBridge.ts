import {
  Notice,
  TFile,
  TFolder,
  normalizePath,
  type App,
  type CachedMetadata,
  type Plugin,
} from 'obsidian'
import type { PluginSettings } from '@/domain/settings/PluginSettings'
import type {
  VaultPort,
  MetadataCachePort,
  CanvasPort,
  NotificationPort,
  LoggerPort,
  SettingsPort,
  FileMetadataSnapshot,
  HeadingSnapshot,
  Unsubscriber,
  JsonCanvasData,
} from '@/domain/ports'

type FileManagerWithTrash = App['fileManager'] & {
  trashFile?: (file: TFile) => Promise<void>
}

/**
 * Production bridge that implements all six narrow ports against the live
 * Obsidian `App` and `Plugin` instances. Passed into every tool registrar
 * when the MCP server starts.
 *
 * Constructor takes `app` + `plugin` so it can call `plugin.loadData /
 * saveData` for settings persistence — the only safe way to persist data in
 * an Obsidian plugin.
 */
export class ObsidianBridge
  implements VaultPort, MetadataCachePort, CanvasPort, NotificationPort, LoggerPort, SettingsPort
{
  private static readonly _LEVEL_RANK: Record<string, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  }

  constructor(
    private readonly app: App,
    private readonly plugin: Plugin & { settings: PluginSettings },
  ) {}

  // ── VaultPort ─────────────────────────────────────────────────────────────

  async readFile(path: string): Promise<string> {
    const normalized = normalizePath(path)
    const file = this.app.vault.getAbstractFileByPath(normalized)
    if (!(file instanceof TFile)) throw new Error(`File not found: ${normalized}`)
    return this.app.vault.read(file)
  }

  async writeFile(path: string, content: string): Promise<void> {
    const normalized = normalizePath(path)
    const existing = this.app.vault.getAbstractFileByPath(normalized)
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content)
    } else {
      await this.app.vault.create(normalized, content)
    }
  }

  async deleteFile(path: string): Promise<void> {
    const normalized = normalizePath(path)
    const file = this.app.vault.getAbstractFileByPath(normalized)
    if (file instanceof TFile) {
      const fileManager = this.app.fileManager as FileManagerWithTrash
      if (typeof fileManager.trashFile === 'function') {
        await fileManager.trashFile(file)
        return
      }
      await this.app.vault.delete(file)
    }
  }

  async listFiles(folder: string): Promise<string[]> {
    const normalized = normalizePath(folder)
    const dir = this.app.vault.getAbstractFileByPath(normalized)
    if (!(dir instanceof TFolder)) return []
    return dir.children.filter((f): f is TFile => f instanceof TFile).map((f) => f.path)
  }

  async listFolders(parent: string): Promise<string[]> {
    const normalized = normalizePath(parent)
    const dir = this.app.vault.getAbstractFileByPath(normalized)
    if (!(dir instanceof TFolder)) return []
    return dir.children.filter((f): f is TFolder => f instanceof TFolder).map((f) => f.name)
  }

  async fileExists(path: string): Promise<boolean> {
    const normalized = normalizePath(path)
    return this.app.vault.getAbstractFileByPath(normalized) instanceof TFile
  }

  async createFolder(path: string): Promise<void> {
    const normalized = normalizePath(path)
    if (!(this.app.vault.getAbstractFileByPath(normalized) instanceof TFolder)) {
      await this.app.vault.createFolder(normalized)
    }
  }

  async searchFiles(
    query: string,
    folder?: string,
  ): Promise<Array<{ path: string; excerpt: string }>> {
    const lower = query.toLowerCase()
    const prefix = folder !== undefined && folder !== '' && folder !== '/'
      ? (folder.endsWith('/') ? folder : `${folder}/`)
      : null
    const allFiles = this.app.vault.getFiles().filter((f) => {
      if (prefix !== null && !f.path.startsWith(prefix)) return false
      return f.extension === 'md' || f.extension === 'txt' || f.extension === 'canvas'
    })
    const results: Array<{ path: string; excerpt: string }> = []
    for (const file of allFiles) {
      if (results.length >= 100) break
      let content: string
      try {
        content = await this.app.vault.cachedRead(file)
      } catch {
        continue
      }
      const lowerContent = content.toLowerCase()
      const idx = lowerContent.indexOf(lower)
      if (idx === -1) continue
      const start = Math.max(0, idx - 60)
      const end = Math.min(content.length, idx + query.length + 60)
      const excerpt = content.slice(start, end)
      results.push({ path: file.path, excerpt })
    }
    return results
  }

  // ── MetadataCachePort ────────────────────────────────────────────────────

  getFileMetadata(path: string): FileMetadataSnapshot | null {
    const cache = this.app.metadataCache.getCache(path)
    if (!cache) return null
    return metadataCacheToSnapshot(path, cache)
  }

  getBacklinks(path: string): string[] {
    // app.metadataCache.getBacklinksForFile is available from Obsidian 0.12+
    interface MetadataCacheWithBacklinks {
      getBacklinksForFile?: (file: TFile | null) => { data: Map<string, unknown> }
    }
    const mc = this.app.metadataCache as unknown as MetadataCacheWithBacklinks
    if (typeof mc.getBacklinksForFile !== 'function') return []
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path))
    if (!(file instanceof TFile)) return []
    const result = mc.getBacklinksForFile(file)
    return Array.from(result.data.keys())
  }

  getResolvedLinks(sourcePath: string): Record<string, number> {
    return this.app.metadataCache.resolvedLinks[sourcePath] ?? {}
  }

  getAllTags(): Record<string, number> {
    // MetadataCache.getTags() is available at runtime but not in the public type definitions.
    // Access via a typed interface cast.
    interface MetadataCacheWithGetTags {
      getTags(): Record<string, number>
    }
    const mc = this.app.metadataCache as unknown as MetadataCacheWithGetTags
    if (typeof mc.getTags === 'function') return mc.getTags()
    return {}
  }

  getFirstLinkpathDest(linktext: string, sourcePath: string): string | null {
    const file = this.app.metadataCache.getFirstLinkpathDest(linktext, sourcePath)
    return file?.path ?? null
  }

  onMetadataChanged(handler: (path: string) => void): Unsubscriber {
    const ref = this.app.metadataCache.on('changed', (file) => {
      handler(file.path)
    })
    return () => {
      this.app.metadataCache.offref(ref)
    }
  }

  // ── CanvasPort ───────────────────────────────────────────────────────────

  isCanvas(path: string): boolean {
    return path.endsWith('.canvas')
  }

  async readCanvas(path: string): Promise<JsonCanvasData> {
    const content = await this.readFile(path)
    try {
      return JSON.parse(content) as JsonCanvasData
    } catch {
      throw new Error(`Invalid JSON Canvas file: ${path}`)
    }
  }

  async writeCanvas(path: string, data: JsonCanvasData): Promise<void> {
    await this.writeFile(path, JSON.stringify(data, null, 2))
  }

  // ── NotificationPort ─────────────────────────────────────────────────────

  showError(message: string, durationMs = 0): void {
    new Notice(`[Error] ${message}`, durationMs)
  }

  showWarning(message: string, durationMs = 8000): void {
    new Notice(`[Warning] ${message}`, durationMs)
  }

  showSuccess(message: string, durationMs = 4000): void {
    new Notice(`[✓] ${message}`, durationMs)
  }

  showInfo(message: string, durationMs = 4000): void {
    new Notice(`[Info] ${message}`, durationMs)
  }

  // ── LoggerPort ───────────────────────────────────────────────────────────

  private _shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    const configured = this.plugin.settings.logLevel
    return (ObsidianBridge._LEVEL_RANK[level] ?? 0) >= (ObsidianBridge._LEVEL_RANK[configured] ?? 0)
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (!this._shouldLog('debug')) return
    console.debug(`[SpecoratorMcp] ${message}`, context)
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (!this._shouldLog('info')) return
    console.info(`[SpecoratorMcp] ${message}`, context)
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (!this._shouldLog('warn')) return
    console.warn(`[SpecoratorMcp] ${message}`, context)
  }

  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    if (!this._shouldLog('error')) return
    console.error(`[SpecoratorMcp] ${message}`, error, context)
  }

  // ── SettingsPort ─────────────────────────────────────────────────────────

  getSettings(): PluginSettings {
    return { ...this.plugin.settings }
  }

  async saveSettings(settings: PluginSettings): Promise<void> {
    this.plugin.settings = { ...settings }
    await this.plugin.saveData(settings)
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

function metadataCacheToSnapshot(path: string, cache: CachedMetadata): FileMetadataSnapshot {
  const tags = (cache.tags ?? []).map((t) => t.tag)
  const frontmatter = (cache.frontmatter ?? {}) as Record<string, unknown>
  const links = (cache.links ?? []).map((l) => l.link)
  const embeds = (cache.embeds ?? []).map((e) => e.link)
  const headings: HeadingSnapshot[] | undefined =
    cache.headings !== undefined
      ? cache.headings.map((h) => ({ heading: h.heading, level: h.level }))
      : undefined
  return { path, tags, frontmatter, links, embeds, headings }
}
