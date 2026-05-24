import type { SettingsPort } from '@/domain/ports'
import { type PluginSettings, DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

/**
 * In-memory {@link SettingsPort} for unit tests.
 */
export class MockSettingsPort implements SettingsPort {
  private settings: PluginSettings = { ...DEFAULT_SETTINGS }

  getSettings(): PluginSettings {
    return { ...this.settings }
  }

  async saveSettings(settings: PluginSettings): Promise<void> {
    this.settings = { ...settings }
  }

  /** Test helper: merge partial settings without going through saveSettings. */
  seedSettings(partial: Partial<PluginSettings>): void {
    this.settings = { ...this.settings, ...partial }
  }
}
