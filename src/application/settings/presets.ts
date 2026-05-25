import {
  DEFAULT_TOOL_MODES,
  type PluginSettings,
  type ToolMode,
} from '@/domain/settings/PluginSettings'

export type Preset = 'all-ask' | 'safe-defaults' | 'all-allow'

/**
 * Pure function: returns a new settings object with toolModes updated
 * according to the requested preset. Does not mutate the input.
 */
export function applyPreset(current: PluginSettings, preset: Preset): PluginSettings {
  switch (preset) {
    case 'all-ask': {
      const toolModes: Record<string, ToolMode> = {}
      for (const key of Object.keys(DEFAULT_TOOL_MODES)) {
        toolModes[key] = 'ask'
      }
      return { ...current, toolModes }
    }
    case 'safe-defaults': {
      const toolModes: Record<string, ToolMode> = { ...DEFAULT_TOOL_MODES }
      return { ...current, toolModes }
    }
    case 'all-allow': {
      const toolModes: Record<string, ToolMode> = {}
      for (const key of Object.keys(DEFAULT_TOOL_MODES)) {
        toolModes[key] = 'allow'
      }
      return { ...current, toolModes }
    }
  }
}
