import type { PluginSettings } from '@/domain/settings/PluginSettings'

/**
 * Reads and persists plugin configuration. Returns defensive copies so
 * callers cannot mutate the canonical store.
 */
export interface SettingsPort {
  getSettings(): PluginSettings
  saveSettings(settings: PluginSettings): Promise<void>
}
