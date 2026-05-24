import type {
  VaultPort,
  MetadataCachePort,
  CanvasPort,
  NotificationPort,
  LoggerPort,
  SettingsPort,
  FileMetadataSnapshot,
  HeadingSnapshot,
  JsonCanvasData,
  Unsubscriber,
} from '@/domain/ports'
import { type PluginSettings } from '@/domain/settings/PluginSettings'
import { MockVaultPort } from './MockVaultPort'
import { MockMetadataCachePort } from './MockMetadataCachePort'
import { MockCanvasPort } from './MockCanvasPort'
import { MockNotificationPort } from './MockNotificationPort'
import { MockLoggerPort } from './MockLoggerPort'
import { MockSettingsPort } from './MockSettingsPort'

/**
 * Thin composition of per-port mocks.
 *
 * Implements all six ports by delegating to one instance per port so existing
 * tests that use `MockBridge` directly continue to work. Per-port mocks are
 * exposed as public fields for tests that only need a single port.
 *
 * @see MockVaultPort, MockMetadataCachePort, MockCanvasPort, MockNotificationPort,
 *      MockLoggerPort, MockSettingsPort
 */
export class MockBridge
  implements VaultPort, MetadataCachePort, CanvasPort, NotificationPort, LoggerPort, SettingsPort
{
  readonly vaultPort: MockVaultPort
  readonly metadataCachePort: MockMetadataCachePort
  readonly canvasPort: MockCanvasPort
  readonly notificationPort: MockNotificationPort
  readonly loggerPort: MockLoggerPort
  readonly settingsPort: MockSettingsPort

  constructor(initialFiles: Record<string, string> = {}) {
    this.vaultPort = new MockVaultPort(initialFiles)
    this.metadataCachePort = new MockMetadataCachePort()
    this.canvasPort = new MockCanvasPort()
    this.notificationPort = new MockNotificationPort()
    this.loggerPort = new MockLoggerPort()
    this.settingsPort = new MockSettingsPort()
  }

  // ── VaultPort ─────────────────────────────────────────────────────────────
  readFile(path: string): Promise<string> {
    return this.vaultPort.readFile(path)
  }
  writeFile(path: string, content: string): Promise<void> {
    return this.vaultPort.writeFile(path, content)
  }
  deleteFile(path: string): Promise<void> {
    return this.vaultPort.deleteFile(path)
  }
  listFiles(folder: string): Promise<string[]> {
    return this.vaultPort.listFiles(folder)
  }
  listFolders(parent: string): Promise<string[]> {
    return this.vaultPort.listFolders(parent)
  }
  fileExists(path: string): Promise<boolean> {
    return this.vaultPort.fileExists(path)
  }
  createFolder(path: string): Promise<void> {
    return this.vaultPort.createFolder(path)
  }

  // ── MetadataCachePort ────────────────────────────────────────────────────
  seedMetadata(path: string, snapshot: FileMetadataSnapshot): void {
    this.metadataCachePort.seedMetadata(path, snapshot)
  }
  seedBacklinks(path: string, sources: string[]): void {
    this.metadataCachePort.seedBacklinks(path, sources)
  }
  seedResolvedLinks(path: string, links: Record<string, number>): void {
    this.metadataCachePort.seedResolvedLinks(path, links)
  }
  seedTags(tags: Record<string, number>): void {
    this.metadataCachePort.seedTags(tags)
  }
  seedLinkpathDest(linktext: string, sourcePath: string, dest: string): void {
    this.metadataCachePort.seedLinkpathDest(linktext, sourcePath, dest)
  }

  seedHeadings(path: string, headings: HeadingSnapshot[]): void {
    this.metadataCachePort.seedHeadings(path, headings)
  }
  triggerMetadataChange(path: string): void {
    this.metadataCachePort.triggerMetadataChange(path)
  }
  getFileMetadata(path: string): FileMetadataSnapshot | null {
    return this.metadataCachePort.getFileMetadata(path)
  }
  getBacklinks(path: string): string[] {
    return this.metadataCachePort.getBacklinks(path)
  }
  getResolvedLinks(sourcePath: string): Record<string, number> {
    return this.metadataCachePort.getResolvedLinks(sourcePath)
  }
  getAllTags(): Record<string, number> {
    return this.metadataCachePort.getAllTags()
  }
  getFirstLinkpathDest(linktext: string, sourcePath: string): string | null {
    return this.metadataCachePort.getFirstLinkpathDest(linktext, sourcePath)
  }
  onMetadataChanged(handler: (path: string) => void): Unsubscriber {
    return this.metadataCachePort.onMetadataChanged(handler)
  }

  // ── CanvasPort ───────────────────────────────────────────────────────────
  seedCanvas(path: string, data: JsonCanvasData): void {
    this.canvasPort.seedCanvas(path, data)
  }
  getWrittenCanvas(path: string): JsonCanvasData | undefined {
    return this.canvasPort.getWrittenCanvas(path)
  }
  isCanvas(path: string): boolean {
    return this.canvasPort.isCanvas(path)
  }
  readCanvas(path: string): Promise<JsonCanvasData> {
    return this.canvasPort.readCanvas(path)
  }
  writeCanvas(path: string, data: JsonCanvasData): Promise<void> {
    return this.canvasPort.writeCanvas(path, data)
  }

  // ── NotificationPort ─────────────────────────────────────────────────────
  showError(message: string, durationMs?: number): void {
    this.notificationPort.showError(message, durationMs)
  }
  showWarning(message: string, durationMs?: number): void {
    this.notificationPort.showWarning(message, durationMs)
  }
  showSuccess(message: string, durationMs?: number): void {
    this.notificationPort.showSuccess(message, durationMs)
  }
  showInfo(message: string, durationMs?: number): void {
    this.notificationPort.showInfo(message, durationMs)
  }

  /** Delegate accessor kept for back-compat with existing tests. */
  get notices(): MockNotificationPort['notices'] {
    return this.notificationPort.notices
  }

  // ── LoggerPort ───────────────────────────────────────────────────────────
  debug(message: string, context?: Record<string, unknown>): void {
    this.loggerPort.debug(message, context)
  }
  info(message: string, context?: Record<string, unknown>): void {
    this.loggerPort.info(message, context)
  }
  warn(message: string, context?: Record<string, unknown>): void {
    this.loggerPort.warn(message, context)
  }
  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    this.loggerPort.error(message, error, context)
  }

  /** Delegate accessor kept for back-compat with existing tests. */
  get logEntries(): MockLoggerPort['logEntries'] {
    return this.loggerPort.logEntries
  }

  // ── SettingsPort ─────────────────────────────────────────────────────────
  getSettings(): PluginSettings {
    return this.settingsPort.getSettings()
  }
  saveSettings(settings: PluginSettings): Promise<void> {
    return this.settingsPort.saveSettings(settings)
  }

  // ── Test helpers (delegating to per-port mocks) ──────────────────────────
  seedSettings(partial: Partial<PluginSettings>): void {
    this.settingsPort.seedSettings(partial)
  }

  getAllFiles(): Record<string, string> {
    return this.vaultPort.getAllFiles()
  }
}
