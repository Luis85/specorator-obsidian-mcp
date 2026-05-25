export type ScanKind =
  | 'override'
  | 'hidden-unicode'
  | 'external-url'
  | 'blob'
  | 'destructive-tool'
  | 'html-embed'
  | 'allowed-tools-wildcard'
  | 'idn-homograph'
  | 'override-dilution'

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
// WS-Z2 Fix 4: html-embed and allowed-tools-wildcard are hard-blocks.
export const HARD_BLOCK_KINDS: ScanKind[] = [
  'hidden-unicode',
  'html-embed',
  'allowed-tools-wildcard',
]

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

// WS-Z2 Fix 4a: HTML embeds — active content tags that can load external resources or execute code.
const HTML_EMBED_RE = /<(img|script|iframe|object|embed)\b/i

// WS-Z2 Fix 4b: allowed-tools wildcard in frontmatter — grants every tool without restriction.
// Matches: allowed-tools: "*"  allowed-tools: '*'  allowed-tools: *  (with optional whitespace)
const ALLOWED_TOOLS_WILDCARD_RE = /allowed-tools\s*:\s*['"`]?\*['"`]?/i

// WS-Z2 Fix 4c: IDN homograph — non-ASCII characters in a URL hostname suggest
// visually deceptive domain names (e.g. pаypal.com with Cyrillic а).
const URL_HOSTNAME_RE = /https?:\/\/([^/\s?#]+)/gi
// \P{ASCII} matches any character outside the ASCII range (U+0000–U+007F).
// Using a Unicode property escape avoids the no-control-regex lint rule.
const NON_ASCII_RE = /\P{ASCII}/u

// WS-Z2 Fix 4d: override dilution — same semantic as OVERRIDE_RE but with no
// distance limit, catching attempts to hide the override across many intervening words.
const DILUTION_RE =
  /\b(ignore|disregard)\b[\s\S]*?\b(previously?|prior)\b[\s\S]*?\b(instruction)\b/i

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

  // WS-Z2 Fix 4a: HTML embeds (hard-block)
  if (HTML_EMBED_RE.test(normalized))
    findings.push({ kind: 'html-embed', detail: 'active HTML content tag' })

  // WS-Z2 Fix 4b: allowed-tools wildcard (hard-block)
  if (ALLOWED_TOOLS_WILDCARD_RE.test(normalized))
    findings.push({
      kind: 'allowed-tools-wildcard',
      detail: 'allowed-tools set to wildcard (*) in frontmatter',
    })

  // WS-Z2 Fix 4c: IDN homograph — scan each URL hostname for non-ASCII chars (advisory)
  URL_HOSTNAME_RE.lastIndex = 0
  let urlMatch: RegExpExecArray | null
  while ((urlMatch = URL_HOSTNAME_RE.exec(normalized)) !== null) {
    const hostname = urlMatch[1] ?? ''
    if (NON_ASCII_RE.test(hostname)) {
      findings.push({ kind: 'idn-homograph', detail: `non-ASCII chars in hostname: ${hostname}` })
      break // one finding per asset is sufficient
    }
  }

  // WS-Z2 Fix 4d: override dilution — wide-window override pattern (advisory)
  // Only add if OVERRIDE_RE did not already flag (avoid double-reporting the same intent).
  if (!findings.some((f) => f.kind === 'override') && DILUTION_RE.test(normalized))
    findings.push({ kind: 'override-dilution', detail: 'diluted instruction-override phrase' })

  return { flagged: findings.length > 0, findings, normalized }
}
