/**
 * Format-preserving editor for a single TOML table block (e.g.
 * `[mcp_servers.specorator-obsidian-mcp]`). Operates on raw text and never
 * parses the whole document, so comments, key order, and unrelated tables are
 * preserved. Trailing blank lines that separate our block from the next table
 * are kept, and CRLF line endings are detected and preserved. `header` is the
 * dotted table path WITHOUT brackets.
 */

/** A trimmed line that opens a TOML table or array-of-tables: `[x]` / `[[x]]`. */
function isTableHeader(line: string): boolean {
  return line.trim().startsWith('[')
}

function headerLine(header: string): string {
  return `[${header}]`
}

/** Index of the line that is exactly `[header]`, or -1. */
function findHeaderIdx(lines: string[], header: string): number {
  const target = headerLine(header)
  return lines.findIndex((l) => l.trim() === target)
}

/**
 * End-exclusive index of our block: the next table header after `start`, else
 * EOF — but with any trailing blank lines excluded so the separator before the
 * following table stays attached to that table, not our block.
 */
function blockEnd(lines: string[], start: number): number {
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (isTableHeader(lines[i]!)) {
      end = i
      break
    }
  }
  while (end - 1 > start && lines[end - 1]!.trim() === '') end--
  return end
}

/** Run `fn` on LF-normalised content, restoring CRLF endings if the input used them. */
function preservingLineEndings(content: string, fn: (lf: string) => string): string {
  if (!content.includes('\r\n')) return fn(content)
  return fn(content.replace(/\r\n/g, '\n')).replace(/\n/g, '\r\n')
}

export function hasTomlBlock(content: string, header: string): boolean {
  return findHeaderIdx(content.split('\n'), header) !== -1
}

/** Insert or replace the table block; preserve everything else. */
export function upsertTomlBlock(content: string, header: string, bodyLines: string[]): string {
  return preservingLineEndings(content, (lf) => {
    const block = [headerLine(header), ...bodyLines]
    const lines = lf.split('\n')
    const headerIdx = findHeaderIdx(lines, header)

    if (headerIdx === -1) {
      const trimmed = lf.replace(/\s*$/, '')
      if (trimmed === '') return block.join('\n') + '\n'
      return trimmed + '\n\n' + block.join('\n') + '\n'
    }

    const before = lines.slice(0, headerIdx)
    const after = lines.slice(blockEnd(lines, headerIdx))
    let out = [...before, ...block, ...after].join('\n')
    if (!out.endsWith('\n')) out += '\n'
    return out
  })
}

/** Remove the table block; collapse the blank-line seam left behind. */
export function removeTomlBlock(content: string, header: string): string {
  return preservingLineEndings(content, (lf) => {
    const lines = lf.split('\n')
    const headerIdx = findHeaderIdx(lines, header)
    if (headerIdx === -1) return lf

    const before = lines.slice(0, headerIdx)
    const after = lines.slice(blockEnd(lines, headerIdx))
    // Collapse a doubled blank line at the join.
    while (
      before.length > 0 &&
      before[before.length - 1]!.trim() === '' &&
      after.length > 0 &&
      after[0]!.trim() === ''
    ) {
      after.shift()
    }
    let out = [...before, ...after].join('\n')
    if (out.trim() === '') return ''
    if (!out.endsWith('\n')) out += '\n'
    return out
  })
}

/** Read `url = "..."` (or '...') from WITHIN our block only; ignores other tables and trailing comments. */
export function readTomlBlockUrl(content: string, header: string): string | null {
  const lines = content.split('\n')
  const headerIdx = findHeaderIdx(lines, header)
  if (headerIdx === -1) return null
  const end = blockEnd(lines, headerIdx)
  for (let i = headerIdx + 1; i < end; i++) {
    const line = lines[i]!.replace(/\r$/, '')
    const m = line.match(/^\s*url\s*=\s*["']([^"']*)["']\s*(#.*)?$/)
    if (m) return m[1]!
  }
  return null
}
