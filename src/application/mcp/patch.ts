/**
 * Pure-domain helpers for surgical note editing.
 *
 * Anchor types:
 *   - heading: exact heading text match (without leading #)
 *   - block:   block reference id (e.g. "xyz" for ^xyz)
 *   - frontmatter: dot-path into the YAML frontmatter block
 *   - eof: appended at / prepended before the end of the file
 *
 * Op types:
 *   - append:  insert content after the anchor's section / line
 *   - prepend: insert content before the anchor's section / line
 *   - replace: replace the anchor's section / line content
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

export type PatchAnchor =
  | { type: 'heading'; value: string }
  | { type: 'block'; value: string }
  | { type: 'frontmatter'; value: string }
  | { type: 'eof' }

export type PatchOp = 'append' | 'prepend' | 'replace'

export interface PatchResult {
  content: string
  bytesChanged: number
}

export type PatchError =
  | { code: 'anchor_not_found'; message: string }
  | { code: 'invalid_frontmatter'; message: string }

// ---------------------------------------------------------------------------
// Heading section helpers
// ---------------------------------------------------------------------------

/** Return the heading level of a line (1–6) or 0 if not a heading. */
function headingLevel(line: string): number {
  const m = /^(#{1,6})\s/.exec(line)
  return m ? m[1].length : 0
}

/**
 * Find the heading line index that exactly matches `headingText`.
 * Returns -1 if not found.
 */
function findHeadingIndex(lines: string[], headingText: string): number {
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.*)$/.exec(lines[i])
    if (m && m[2] === headingText) return i
  }
  return -1
}

/**
 * Return the range [startLine, endLine) for the section body under a heading.
 * startLine is the line after the heading; endLine is the first line at the
 * same or higher (lower number) heading level, or EOF.
 */
function sectionBodyRange(
  lines: string[],
  headingIndex: number,
): { bodyStart: number; bodyEnd: number } {
  const level = headingLevel(lines[headingIndex])
  const bodyStart = headingIndex + 1
  let bodyEnd = lines.length
  for (let i = bodyStart; i < lines.length; i++) {
    const lvl = headingLevel(lines[i])
    if (lvl > 0 && lvl <= level) {
      bodyEnd = i
      break
    }
  }
  return { bodyStart, bodyEnd }
}

// ---------------------------------------------------------------------------
// patch: heading anchor
// ---------------------------------------------------------------------------

function patchHeading(
  lines: string[],
  headingText: string,
  op: PatchOp,
  content: string,
): string[] | PatchError {
  const idx = findHeadingIndex(lines, headingText)
  if (idx === -1) {
    return {
      code: 'anchor_not_found',
      message: `Heading "${headingText}" not found`,
    }
  }

  const { bodyStart, bodyEnd } = sectionBodyRange(lines, idx)
  const contentLines = content === '' ? [] : content.split('\n')

  switch (op) {
    case 'append': {
      // Insert after bodyEnd - 1 (last line of the body), keeping trailing section start intact
      const result = [...lines]
      result.splice(bodyEnd, 0, ...contentLines)
      return result
    }
    case 'prepend': {
      // Insert at bodyStart (first line of body)
      const result = [...lines]
      result.splice(bodyStart, 0, ...contentLines)
      return result
    }
    case 'replace': {
      // Replace bodyStart..bodyEnd with contentLines
      const result = [...lines]
      result.splice(bodyStart, bodyEnd - bodyStart, ...contentLines)
      return result
    }
  }
}

// ---------------------------------------------------------------------------
// patch: block anchor
// ---------------------------------------------------------------------------

function patchBlock(
  lines: string[],
  blockId: string,
  op: PatchOp,
  content: string,
): string[] | PatchError {
  // Strip leading ^ if caller included it
  const id = blockId.startsWith('^') ? blockId.slice(1) : blockId
  const blockRegex = new RegExp(`\\^${id}(?:\\s|$)`)
  const idx = lines.findIndex((l) => blockRegex.test(l))
  if (idx === -1) {
    return {
      code: 'anchor_not_found',
      message: `Block reference "^${id}" not found`,
    }
  }

  const contentLines = content === '' ? [] : content.split('\n')
  const result = [...lines]

  switch (op) {
    case 'append':
      result.splice(idx + 1, 0, ...contentLines)
      break
    case 'prepend':
      result.splice(idx, 0, ...contentLines)
      break
    case 'replace':
      result.splice(idx, 1, ...contentLines)
      break
  }
  return result
}

// ---------------------------------------------------------------------------
// patch: frontmatter anchor
// ---------------------------------------------------------------------------

/**
 * Navigate or create a nested path in a plain-object tree using dot notation.
 * Returns a copy of `obj` with the value at `keyPath` set/replaced.
 */
function setNestedKey(obj: Record<string, unknown>, keyPath: string, value: unknown): void {
  const keys = keyPath.split('.')
  let current: Record<string, unknown> = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (key === undefined) continue
    if (typeof current[key] !== 'object' || current[key] === null || Array.isArray(current[key])) {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }
  const lastKey = keys[keys.length - 1]
  if (lastKey !== undefined) {
    current[lastKey] = value
  }
}

function getNestedKey(obj: Record<string, unknown>, keyPath: string): unknown {
  const keys = keyPath.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

function patchFrontmatter(
  originalContent: string,
  keyPath: string,
  op: PatchOp,
  content: string,
): string | PatchError {
  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(originalContent)
  let parsed: Record<string, unknown> = {}
  let bodyStart = 0

  if (fmMatch) {
    try {
      const result = parseYaml(fmMatch[1]) as unknown
      if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
        parsed = result as Record<string, unknown>
      }
      bodyStart = fmMatch[0].length
    } catch {
      return { code: 'invalid_frontmatter', message: 'Failed to parse existing frontmatter' }
    }
  }

  // For 'replace' and 'append': op on the key directly
  // For 'prepend': insert value before existing (string concat or array prepend)
  switch (op) {
    case 'replace': {
      setNestedKey(parsed, keyPath, content)
      break
    }
    case 'append': {
      const existing = getNestedKey(parsed, keyPath)
      if (Array.isArray(existing)) {
        setNestedKey(parsed, keyPath, [...existing, content])
      } else if (typeof existing === 'string') {
        setNestedKey(parsed, keyPath, existing + content)
      } else {
        setNestedKey(parsed, keyPath, content)
      }
      break
    }
    case 'prepend': {
      const existing = getNestedKey(parsed, keyPath)
      if (Array.isArray(existing)) {
        setNestedKey(parsed, keyPath, [content, ...existing])
      } else if (typeof existing === 'string') {
        setNestedKey(parsed, keyPath, content + existing)
      } else {
        setNestedKey(parsed, keyPath, content)
      }
      break
    }
  }

  const body = originalContent.slice(bodyStart)
  return `---\n${stringifyYaml(parsed)}---\n${body}`
}

// ---------------------------------------------------------------------------
// patch: eof anchor
// ---------------------------------------------------------------------------

function patchEof(lines: string[], op: PatchOp, content: string): string[] {
  const contentLines = content === '' ? [] : content.split('\n')
  switch (op) {
    case 'append':
    case 'replace':
      return [...lines, ...contentLines]
    case 'prepend':
      return [...contentLines, ...lines]
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function applyPatch(
  originalContent: string,
  anchor: PatchAnchor,
  op: PatchOp,
  content: string,
): { ok: true; result: PatchResult } | { ok: false; error: PatchError } {
  if (anchor.type === 'frontmatter') {
    const result = patchFrontmatter(originalContent, anchor.value, op, content)
    if (typeof result !== 'string') return { ok: false, error: result }
    const encoder = new TextEncoder()
    return {
      ok: true,
      result: {
        content: result,
        bytesChanged: Math.abs(
          encoder.encode(result).length - encoder.encode(originalContent).length,
        ),
      },
    }
  }

  const lines = originalContent.split('\n')
  let newLines: string[] | PatchError

  switch (anchor.type) {
    case 'heading':
      newLines = patchHeading(lines, anchor.value, op, content)
      break
    case 'block':
      newLines = patchBlock(lines, anchor.value, op, content)
      break
    case 'eof':
      newLines = patchEof(lines, op, content)
      break
  }

  if (!Array.isArray(newLines)) {
    return { ok: false, error: newLines }
  }

  const newContent = newLines.join('\n')
  const encoder = new TextEncoder()
  return {
    ok: true,
    result: {
      content: newContent,
      bytesChanged: Math.abs(
        encoder.encode(newContent).length - encoder.encode(originalContent).length,
      ),
    },
  }
}
