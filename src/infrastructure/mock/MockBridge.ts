import type {
  VaultPort,
  MetadataCachePort,
  CanvasPort,
  NotificationPort,
  LoggerPort,
  SettingsPort,
  FileMetadataSnapshot,
  JsonCanvasData,
  Unsubscriber,
} from '@/domain/ports'
import { type PluginSettings, DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

function folderPrefix(parent: string): string {
  if (parent === '') return ''
  return parent.endsWith('/') ? parent : `${parent}/`
}

/**
 * In-memory bridge used in unit tests and standalone dev mode.
 * Implements VaultPort, MetadataCachePort, CanvasPort, NotificationPort,
 * LoggerPort, and SettingsPort in one class for convenient test wiring.
 * Provides test helper methods for inspecting captured state.
 */
export class MockBridge
  implements VaultPort, MetadataCachePort, CanvasPort, NotificationPort, LoggerPort, SettingsPort
{
  // ── VaultPort ─────────────────────────────────────────────────────────────
  private readonly files = new Map<string, string>()
  private readonly folders = new Set<string>()

  constructor(initialFiles: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initialFiles)) {
      this.files.set(path, content)
      // Register parent folders automatically
      const parts = path.split('/')
      for (let i = 1; i < parts.length; i++) {
        this.folders.add(parts.slice(0, i).join('/'))
      }
    }
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path)
    if (content === undefined) throw new Error(`[MockBridge] File not found: ${path}`)
    return content
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content)
  }

  async deleteFile(path: string): Promise<void> {
    this.files.delete(path)
  }

  async listFiles(folder: string): Promise<string[]> {
    if (folder === '') {
      return [...this.files.keys()].filter((p) => !p.includes('/'))
    }
    const prefix = folder.endsWith('/') ? folder : `${folder}/`
    return [...this.files.keys()].filter((p) => {
      if (!p.startsWith(prefix)) return false
      return !p.slice(prefix.length).includes('/')
    })
  }

  async listFolders(parent: string): Promise<string[]> {
    const prefix = folderPrefix(parent)
    const names = new Set<string>()
    for (const folder of this.folders) {
      if (folder.startsWith(prefix)) {
        const rest = folder.slice(prefix.length)
        if (rest && !rest.includes('/')) names.add(rest)
      }
    }
    for (const path of this.files.keys()) {
      if (!prefix || path.startsWith(prefix)) {
        const rest = path.slice(prefix.length)
        const firstSegment = rest.split('/')[0]
        if (firstSegment && rest.includes('/')) names.add(firstSegment)
      }
    }
    return [...names]
  }

  async fileExists(path: string): Promise<boolean> {
    return this.files.has(path)
  }

  async createFolder(path: string): Promise<void> {
    this.folders.add(path)
  }

  // ── MetadataCachePort ────────────────────────────────────────────────────
  private readonly metadataMap = new Map<string, FileMetadataSnapshot>()
  private readonly backlinksMap = new Map<string, string[]>()
  private readonly resolvedLinksMap = new Map<string, Record<string, number>>()
  private tagsMap: Record<string, number> = {}
  private readonly linkpathDestMap = new Map<string, string>()
  private readonly metadataHandlers = new Set<(path: string) => void>()

  seedMetadata(path: string, snapshot: FileMetadataSnapshot): void {
    this.metadataMap.set(path, snapshot)
  }

  seedBacklinks(path: string, sources: string[]): void {
    this.backlinksMap.set(path, sources)
  }

  seedResolvedLinks(path: string, links: Record<string, number>): void {
    this.resolvedLinksMap.set(path, links)
  }

  seedTags(tags: Record<string, number>): void {
    this.tagsMap = { ...tags }
  }

  seedLinkpathDest(linktext: string, sourcePath: string, dest: string): void {
    this.linkpathDestMap.set(`${linktext}|${sourcePath}`, dest)
  }

  triggerMetadataChange(path: string): void {
    for (const handler of this.metadataHandlers) {
      handler(path)
    }
  }

  getFileMetadata(path: string): FileMetadataSnapshot | null {
    const snapshot = this.metadataMap.get(path)
    return snapshot !== undefined ? structuredClone(snapshot) : null
  }

  getBacklinks(path: string): string[] {
    return [...(this.backlinksMap.get(path) ?? [])]
  }

  getResolvedLinks(sourcePath: string): Record<string, number> {
    return { ...(this.resolvedLinksMap.get(sourcePath) ?? {}) }
  }

  getAllTags(): Record<string, number> {
    return { ...this.tagsMap }
  }

  getFirstLinkpathDest(linktext: string, sourcePath: string): string | null {
    return this.linkpathDestMap.get(`${linktext}|${sourcePath}`) ?? null
  }

  onMetadataChanged(handler: (path: string) => void): Unsubscriber {
    this.metadataHandlers.add(handler)
    return () => {
      this.metadataHandlers.delete(handler)
    }
  }

  // ── CanvasPort ───────────────────────────────────────────────────────────
  private readonly canvasStore = new Map<string, JsonCanvasData>()
  private readonly canvasWritten = new Map<string, JsonCanvasData>()

  seedCanvas(path: string, data: JsonCanvasData): void {
    this.canvasStore.set(path, structuredClone(data))
  }

  getWrittenCanvas(path: string): JsonCanvasData | undefined {
    const data = this.canvasWritten.get(path)
    return data !== undefined ? structuredClone(data) : undefined
  }

  isCanvas(path: string): boolean {
    return path.endsWith('.canvas')
  }

  async readCanvas(path: string): Promise<JsonCanvasData> {
    const data = this.canvasStore.get(path)
    if (data === undefined) {
      throw new Error(`[MockBridge] Canvas not found: ${path}`)
    }
    return structuredClone(data)
  }

  async writeCanvas(path: string, data: JsonCanvasData): Promise<void> {
    const clone = structuredClone(data)
    this.canvasStore.set(path, clone)
    this.canvasWritten.set(path, clone)
  }

  // ── NotificationPort ─────────────────────────────────────────────────────
  private readonly noticeLog: {
    severity: 'error' | 'warning' | 'success' | 'info'
    message: string
    durationMs: number
  }[] = []

  showError(message: string, durationMs = 0): void {
    this.noticeLog.push({ severity: 'error', message, durationMs })
  }

  showWarning(message: string, durationMs = 8000): void {
    this.noticeLog.push({ severity: 'warning', message, durationMs })
  }

  showSuccess(message: string, durationMs = 4000): void {
    this.noticeLog.push({ severity: 'success', message, durationMs })
  }

  showInfo(message: string, durationMs = 4000): void {
    this.noticeLog.push({ severity: 'info', message, durationMs })
  }

  get notices(): readonly {
    severity: 'error' | 'warning' | 'success' | 'info'
    message: string
    durationMs: number
  }[] {
    return [...this.noticeLog]
  }

  getNotices(): {
    severity: 'error' | 'warning' | 'success' | 'info'
    message: string
    durationMs: number
  }[] {
    return [...this.noticeLog]
  }

  // ── LoggerPort ───────────────────────────────────────────────────────────
  readonly logEntries: Array<{
    level: 'debug' | 'info' | 'warn' | 'error'
    message: string
    error?: unknown
    context?: Record<string, unknown>
  }> = []

  debug(message: string, context?: Record<string, unknown>): void {
    this.logEntries.push({ level: 'debug', message, context })
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.logEntries.push({ level: 'info', message, context })
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.logEntries.push({ level: 'warn', message, context })
  }

  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    this.logEntries.push({ level: 'error', message, error, context })
  }

  // ── SettingsPort ─────────────────────────────────────────────────────────
  private settings: PluginSettings = { ...DEFAULT_SETTINGS }

  getSettings(): PluginSettings {
    return { ...this.settings }
  }

  async saveSettings(settings: PluginSettings): Promise<void> {
    this.settings = { ...settings }
  }

  // ── Test helpers ─────────────────────────────────────────────────────────
  seedSettings(partial: Partial<PluginSettings>): void {
    this.settings = { ...this.settings, ...partial }
  }

  getAllFiles(): Record<string, string> {
    return Object.fromEntries(this.files)
  }
}
