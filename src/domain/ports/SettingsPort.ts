/**
 * Reads and persists plugin configuration. Returns defensive copies so
 * callers cannot mutate the canonical store.
 *
 * Note: typed as `unknown` until Task 2.5 tightens it to PluginSettings.
 */
export interface SettingsPort {
  getSettings(): unknown
  saveSettings(s: unknown): Promise<void>
}
