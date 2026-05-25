import { parse as parseYaml } from 'yaml'
import type { AssetMeta, AssetType } from '@/domain/catalog/types'

const NAME_RE = /^[a-z0-9-]{1,64}$/
const TYPES: AssetType[] = ['skill', 'command', 'agent', 'hook']
const MAX_DESCRIPTION = 1024
// A usable skill/asset description tells the agent WHEN to fire it. Accept any
// natural "when"-clause (not a fixed 4-phrase whitelist — R7) so good
// descriptions like "...fires whenever the user mentions orphans" are allowed.
const TRIGGER_RE =
  /\b(use when|use this when|use to|invoke when|trigger|whenever|when the user|fires when)\b/i
// Anthropic skill convention: skill names are gerunds. Accept a gerund in ANY
// segment (R7) — "auditing-vault" OR "vault-auditing" — not only the first.
const GERUND_RE = /\b[a-z0-9]*ing\b/
const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

function parseFrontmatter(raw: string): Record<string, unknown> {
  const parsed: unknown = parseYaml(raw)
  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed))
    return parsed as Record<string, unknown>
  return {}
}

function validateName(id: string, fm: Record<string, unknown>): string {
  if (typeof fm.name !== 'string' || !NAME_RE.test(fm.name))
    throw new Error(`asset ${id}: name must be lowercase-hyphen, <=64 chars`)
  if (fm.name !== id) throw new Error(`asset ${id}: frontmatter name must match folder id`)
  return fm.name
}

function validateDescription(id: string, fm: Record<string, unknown>): string {
  if (typeof fm.description !== 'string' || fm.description.trim() === '')
    throw new Error(`asset ${id}: description required`)
  if (fm.description.length > MAX_DESCRIPTION)
    throw new Error(
      `asset ${id}: description must be <=${MAX_DESCRIPTION} chars (got ${fm.description.length})`,
    )
  return fm.description
}

function validateType(id: string, fm: Record<string, unknown>): AssetType {
  if (!TYPES.includes(fm.type as AssetType)) throw new Error(`asset ${id}: invalid type`)
  return fm.type as AssetType
}

function validateVersion(id: string, fm: Record<string, unknown>): string {
  if (typeof fm.version !== 'string') throw new Error(`asset ${id}: version required`)
  return fm.version
}

// Skills are model-invoked → the description MUST say WHEN to fire. Commands
// and agents are explicitly invoked (slash command / subagent) and are exempt
// from the trigger-phrase + gerund rules (R7 scoping).
function validateSkillConventions(
  id: string,
  type: AssetType,
  name: string,
  description: string,
): void {
  if (type === 'skill' && !TRIGGER_RE.test(description))
    throw new Error(
      `asset ${id}: skill description must contain a "use when"/trigger phrase so the agent knows when to fire it`,
    )
  if (type === 'skill' && !GERUND_RE.test(name))
    throw new Error(
      `asset ${id}: skill name should contain a gerund (e.g. "auditing-vault" or "vault-auditing")`,
    )
}

export function parseAsset(id: string, raw: string): AssetMeta {
  const m = FM_RE.exec(raw)
  if (!m) throw new Error(`asset ${id}: missing YAML frontmatter`)
  const fm = parseFrontmatter(m[1])
  const body: string = m[2]

  const name = validateName(id, fm)
  const description = validateDescription(id, fm)
  const type = validateType(id, fm)
  const version = validateVersion(id, fm)
  validateSkillConventions(id, type, name, description)

  return {
    id,
    name,
    description,
    type,
    version,
    bundle: typeof fm.bundle === 'string' ? fm.bundle : 'Misc',
    requires: Array.isArray(fm.requires) ? fm.requires.map(String) : [],
    dependsOn: Array.isArray(fm.dependsOn) ? fm.dependsOn.map(String) : [],
    body,
  }
}
