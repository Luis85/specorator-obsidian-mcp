import { DEFAULT_TOOL_MODES } from '@/domain/settings/PluginSettings'
import { SAFE_WRITE_TOOLS } from './presets'
import { SERVER_KEY } from '@/application/mcp/AutoRegister'

/** Map an internal dotted tool id to the Claude Code harness form. */
export function toHarnessToolId(dotted: string): string {
  return `mcp__${SERVER_KEY}__${dotted.replace(/\./g, '_')}`
}

/** Reads (default "allow") + safe writes — the tools we add to the harness allowlist. */
export const ALLOWLISTED_TOOLS: readonly string[] = Object.freeze(
  Array.from(
    new Set<string>([
      ...Object.entries(DEFAULT_TOOL_MODES)
        .filter(([, mode]) => mode === 'allow')
        .map(([tool]) => tool),
      ...SAFE_WRITE_TOOLS,
    ]),
  ),
)

export interface MergeResult {
  json: Record<string, unknown>
  added: string[]
}

/**
 * Merge tool ids into a Claude Code `.claude/settings.json` `permissions.allow`
 * array. Pure. Preserves all other keys and existing entries; never duplicates.
 * Throws (caller surfaces a Notice and aborts the write) on invalid JSON, a
 * non-object root, or a non-array `permissions.allow`.
 */
export function mergeAllowlist(existingText: string | null, toolIds: string[]): MergeResult {
  let root: Record<string, unknown> = {}
  if (existingText !== null && existingText.trim() !== '') {
    const parsed: unknown = JSON.parse(existingText)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('.claude/settings.json root is not an object')
    }
    root = parsed as Record<string, unknown>
  }

  const permsRaw = root['permissions']
  const perms: Record<string, unknown> =
    permsRaw !== null && typeof permsRaw === 'object' && !Array.isArray(permsRaw)
      ? (permsRaw as Record<string, unknown>)
      : {}

  const allowRaw = perms['allow']
  if (allowRaw !== undefined && !Array.isArray(allowRaw)) {
    throw new Error('permissions.allow is not an array')
  }
  const allow: string[] = Array.isArray(allowRaw) ? [...(allowRaw as string[])] : []

  const seen = new Set(allow)
  const added: string[] = []
  for (const id of toolIds) {
    if (!seen.has(id)) {
      allow.push(id)
      seen.add(id)
      added.push(id)
    }
  }

  perms['allow'] = allow
  root['permissions'] = perms
  return { json: root, added }
}
