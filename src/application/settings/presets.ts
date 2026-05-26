import {
  DEFAULT_TOOL_MODES,
  type PluginSettings,
  type ToolMode,
} from '@/domain/settings/PluginSettings'

export type Preset = 'all-ask' | 'safe-defaults' | 'all-allow' | 'trusted-writes'

/**
 * Content-mutating tools considered safe to auto-allow: they create or edit
 * notes/metadata but are reversible and non-shell. The "trusted-writes" preset
 * upgrades exactly these from "ask" to "allow".
 */
export const SAFE_WRITE_TOOLS: readonly string[] = Object.freeze([
  'vault.write',
  'vault.createFolder',
  'frontmatter.set',
  'note.patch',
  'tags.rename',
  'canvas.write',
  'bases.create',
  'cli.daily_note',
  'cli.open_file',
  'cli.template_insert',
])

/**
 * Irreversible / relocating tools that always keep their prompt under
 * "trusted-writes". (Shell-level tools cli.eval/execute/run stay "deny" via the
 * defaults and are intentionally NOT listed here.)
 */
export const DESTRUCTIVE_TOOLS: readonly string[] = Object.freeze([
  'vault.delete',
  'vault.move',
  'cli.reload',
])

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
    case 'trusted-writes': {
      const toolModes: Record<string, ToolMode> = { ...DEFAULT_TOOL_MODES }
      for (const tool of SAFE_WRITE_TOOLS) {
        toolModes[tool] = 'allow'
      }
      return { ...current, toolModes }
    }
  }
}
