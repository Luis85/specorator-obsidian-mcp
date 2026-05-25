import type { AssetMeta } from '@/domain/catalog/types'

// MCP v0.1.0 per-tool permission modes (from the plugin's data.json `toolModes`).
export type ToolMode = 'allow' | 'ask' | 'deny'

export interface RequiresResult {
  available: boolean
  missing: string[] // required tools not present at all
  denied: string[] // present but in `deny` mode → effectively unusable
  ask: string[] // present but `ask` → works, with a call-time prompt
  source: 'live' | 'static'
}

export function checkRequires(
  asset: AssetMeta,
  liveTools: string[] | null,
  staticTools: string[],
  modes: Record<string, ToolMode> = {},
): RequiresResult {
  const source = liveTools ? 'live' : 'static'
  const have = new Set(liveTools ?? staticTools)
  const missing = asset.requires.filter((t) => !have.has(t))
  const denied = asset.requires.filter((t) => have.has(t) && modes[t] === 'deny')
  const ask = asset.requires.filter((t) => have.has(t) && modes[t] === 'ask')
  // A denied tool is effectively missing → asset is not available.
  return { available: missing.length === 0 && denied.length === 0, missing, denied, ask, source }
}
