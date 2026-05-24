import { DEFAULT_TOOL_MODES } from '@/domain/settings/PluginSettings'

export const CANONICAL_TOOL_NAMES: readonly string[] = Object.freeze(
  Object.keys(DEFAULT_TOOL_MODES).sort(),
)

const known = new Set(CANONICAL_TOOL_NAMES)

export function isKnownTool(name: string): boolean {
  return known.has(name)
}
