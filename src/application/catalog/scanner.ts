export type ScanKind = 'override' | 'hidden-unicode' | 'external-url' | 'blob' | 'destructive-tool'
export interface ScanFinding {
  kind: ScanKind
  detail: string
}
export interface ScanResult {
  flagged: boolean
  findings: ScanFinding[]
  normalized: string
}

// Hard-block kinds force a ScanBlockedError in enableAsset; others are advisory
// (shown in the consent UI but installable after explicit confirmation).
export const HARD_BLOCK_KINDS: ScanKind[] = ['hidden-unicode']

const OVERRIDE_RE =
  /\b(ignore|disregard|forget)\b[^.\n]{0,40}\b(previous|prior|above)\b[^.\n]{0,20}\b(instruction|prompt|rule)/i
// Unicode "tag" block + bidi/zero-width controls used to hide text.
const HIDDEN_RE = /[\u{E0000}-\u{E007F}\u{200B}-\u{200F}\u{202A}-\u{202E}\u{2066}-\u{2069}]/u
// External URL inside a markdown link: [text](http(s)://...)
const MD_LINK_URL_RE = /\]\(\s*https?:\/\/[^)\s]+/i
// base64 blob: >=40 contiguous base64 chars (optionally padded).
const BASE64_RE = /[A-Za-z0-9+/]{40,}={0,2}/
// hex blob: >=32 contiguous hex chars.
const HEX_RE = /\b[0-9a-fA-F]{32,}\b/
// Fully-qualified destructive tool mentioned in prose.
const DESTRUCTIVE_TOOL_RE =
  /\bmcp__specorator-obsidian-mcp__(vault_delete|vault_move|cli_execute|canvas_write|vault_write)\b/

export interface AllowlistResult extends ScanResult {
  allowlisted: boolean
}

export function scanWithAllowlist(
  body: string,
  bodyHash: string,
  allowlist: Set<string>,
): AllowlistResult {
  if (allowlist.has(bodyHash))
    return { flagged: false, findings: [], normalized: body, allowlisted: true }
  return { ...scanForInjection(body), allowlisted: false }
}

export function scanForInjection(body: string): ScanResult {
  const normalized = body.normalize('NFKC')
  const findings: ScanFinding[] = []
  if (OVERRIDE_RE.test(normalized))
    findings.push({ kind: 'override', detail: 'instruction-override phrase' })
  if (HIDDEN_RE.test(body))
    findings.push({ kind: 'hidden-unicode', detail: 'hidden/bidi/zero-width chars' })
  if (MD_LINK_URL_RE.test(normalized))
    findings.push({ kind: 'external-url', detail: 'external URL in markdown link' })
  if (BASE64_RE.test(normalized) || HEX_RE.test(normalized))
    findings.push({ kind: 'blob', detail: 'embedded base64/hex blob' })
  if (DESTRUCTIVE_TOOL_RE.test(normalized))
    findings.push({ kind: 'destructive-tool', detail: 'fully-qualified destructive tool in prose' })
  return { flagged: findings.length > 0, findings, normalized }
}
