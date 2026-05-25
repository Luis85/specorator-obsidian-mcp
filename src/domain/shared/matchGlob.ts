/**
 * Minimal glob matcher.
 *
 * Supports:
 *  - star         -- matches any sequence of non-slash characters (single segment)
 *  - double-star  -- matches any sequence of characters including slashes
 *  - double-star/ -- optional path prefix
 *
 * No external dependencies. Extracted from PermissionGate so both
 * PermissionGate and vault.walk can import from a single source.
 */

// Characters that need escaping in a regex pattern.
// Defined as a Set to avoid regex-literal syntax issues under strict TS parsers.
const REGEX_SPECIAL_CHARS = new Set<string>([
  '.',
  '+',
  '?',
  '^',
  '$',
  '{',
  '}',
  '(',
  ')',
  '|',
  '[',
  ']',
  '\\',
])

export function matchGlob(pattern: string, input: string): boolean {
  let converted = ''
  let i = 0
  while (i < pattern.length) {
    const ch = pattern[i]!
    if (ch === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') {
        converted += '(.+/)?'
        i += 3
      } else {
        converted += '.*'
        i += 2
      }
    } else if (ch === '*') {
      converted += '[^/]*'
      i++
    } else if (REGEX_SPECIAL_CHARS.has(ch)) {
      converted += '\\' + ch
      i++
    } else {
      converted += ch
      i++
    }
  }
  const re = new RegExp('^' + converted + '$')
  return re.test(input)
}
