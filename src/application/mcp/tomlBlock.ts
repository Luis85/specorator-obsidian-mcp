/**
 * Format-preserving editor for a single TOML table block (e.g.
 * `[mcp_servers.specorator-obsidian-mcp]`). Operates on raw text and never
 * parses the whole document, so comments, key order, and unrelated tables are
 * left byte-for-byte intact. `header` is the dotted table path WITHOUT brackets.
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

/** End-exclusive index of our block: the next table header after `start`, else EOF. */
function blockEnd(lines: string[], start: number): number {
  for (let i = start + 1; i < lines.length; i++) {
    if (isTableHeader(lines[i]!)) return i
  }
  return lines.length
}

export function hasTomlBlock(content: string, header: string): boolean {
  return findHeaderIdx(content.split('\n'), header) !== -1
}

/** Insert or replace the table block; preserve everything else. */
export function upsertTomlBlock(content: string, header: string, bodyLines: string[]): string {
  const block = [headerLine(header), ...bodyLines]
  const lines = content.split('\n')
  const headerIdx = findHeaderIdx(lines, header)

  if (headerIdx === -1) {
    const trimmed = content.replace(/\s*$/, '')
    if (trimmed === '') return block.join('\n') + '\n'
    return trimmed + '\n\n' + block.join('\n') + '\n'
  }

  const before = lines.slice(0, headerIdx)
  const after = lines.slice(blockEnd(lines, headerIdx))
  let out = [...before, ...block, ...after].join('\n')
  if (!out.endsWith('\n')) out += '\n'
  return out
}

/** Remove the table block; collapse the blank-line seam left behind. */
export function removeTomlBlock(content: string, header: string): string {
  const lines = content.split('\n')
  const headerIdx = findHeaderIdx(lines, header)
  if (headerIdx === -1) return content

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
}

/** Read `url = "..."` from WITHIN our block only (ignores other tables). */
export function readTomlBlockUrl(content: string, header: string): string | null {
  const lines = content.split('\n')
  const headerIdx = findHeaderIdx(lines, header)
  if (headerIdx === -1) return null
  const end = blockEnd(lines, headerIdx)
  for (let i = headerIdx + 1; i < end; i++) {
    const m = lines[i]!.match(/^\s*url\s*=\s*"([^"]*)"\s*$/)
    if (m) return m[1]!
  }
  return null
}
