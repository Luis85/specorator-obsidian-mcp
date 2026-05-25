import { stringify as yamlStringify } from 'yaml'
import type { AssetMeta, Platform } from '@/domain/catalog/types'

/** Escape a TOML basic string: backslash, double-quote, and control chars. */
function tomlBasicString(s: string): string {
  const escaped = s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
  return `"${escaped}"`
}

function withFrontmatter(a: AssetMeta, allowedTools?: string): string {
  // yaml.stringify guarantees valid YAML for arbitrary string values (H2/Decision 2).
  // R5: allowed-tools lives HERE in the asset's own frontmatter — the location the
  // host agent actually reads — NOT in a sidecar file. Empty/absent => omit it
  // (default-deny grants nothing).
  const fmObj: Record<string, unknown> = { name: a.name, description: a.description }
  if (allowedTools !== undefined && allowedTools !== '') fmObj['allowed-tools'] = allowedTools
  const fm = yamlStringify(fmObj).trimEnd()
  return `---\n${fm}\n---\n${a.body}`
}

function tomlCommand(a: AssetMeta): string {
  return (
    `description = ${tomlBasicString(a.description)}\n` + `prompt = ${tomlBasicString(a.body)}\n`
  )
}

/**
 * Render an asset to its on-disk content. `allowedTools` (R5) is the
 * least-privilege value from `policy.allowedToolsLine`, injected into the asset's
 * own frontmatter (skills/agents + Claude/Cursor commands carry frontmatter so
 * `allowed-tools` is honored). Gemini TOML commands carry no allowed-tools field.
 */
export function renderAsset(a: AssetMeta, platform: Platform, allowedTools?: string): string {
  if (a.type === 'skill') return withFrontmatter(a, allowedTools)
  if (a.type === 'command') {
    if (platform === 'gemini') return tomlCommand(a)
    // R5: Claude/Cursor commands are markdown WITH frontmatter so allowed-tools applies.
    return withFrontmatter(a, allowedTools)
  }
  if (a.type === 'agent') {
    // H7: agents only emit for Claude/Cursor; markdown + yaml frontmatter.
    return withFrontmatter(a, allowedTools)
  }
  // hook content is authored as JSON in the body (Phase 3 merges it into hooks.json)
  return a.body
}
