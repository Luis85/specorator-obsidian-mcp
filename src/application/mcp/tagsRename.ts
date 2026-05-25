/**
 * Pure-domain helper for bulk tag renaming across vault files.
 *
 * Replaces:
 *   - Inline tags: `#oldTag` (word-boundary–delimited, case-sensitive)
 *   - Frontmatter `tags:` array entries (exact string match)
 *
 * Does not modify file content when dryRun=true.
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

export interface TagRenameFileResult {
  path: string
  occurrences: number
  newContent: string
}

/**
 * Count and replace occurrences of `oldTag` with `newTag` in a single file's content.
 * Returns null when no occurrences found.
 */
export function renameTagInContent(
  content: string,
  oldTag: string,
  newTag: string,
): { occurrences: number; newContent: string } | null {
  // Strip leading # if present
  const old = oldTag.startsWith('#') ? oldTag.slice(1) : oldTag
  const neo = newTag.startsWith('#') ? newTag.slice(1) : newTag

  let totalOccurrences = 0
  let result = content

  // 1. Replace in frontmatter tags array
  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---/.exec(result)
  if (fmMatch) {
    try {
      const parsed = parseYaml(fmMatch[1]) as unknown
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const fm = parsed as Record<string, unknown>
        if (Array.isArray(fm['tags'])) {
          const tags = fm['tags'] as unknown[]
          let changed = 0
          const newTags = tags.map((t) => {
            if (t === old || t === `#${old}`) {
              changed++
              return neo
            }
            return t
          })
          if (changed > 0) {
            totalOccurrences += changed
            fm['tags'] = newTags
            const fmBlock = `---\n${stringifyYaml(fm)}---`
            result =
              result.slice(0, fmMatch.index) +
              fmBlock +
              result.slice(fmMatch.index + fmMatch[0].length)
          }
        }
      }
    } catch {
      // If YAML parse fails, skip frontmatter replacement but continue with inline
    }
  }

  // 2. Replace inline tags — #oldTag with word boundary on both sides
  // A tag ends at a space, end-of-line, punctuation (except dash/underscore/slash which are allowed in tags)
  const inlineRegex = new RegExp(`#${escapeRegex(old)}(?=[\\s,.:;!?()\\[\\]{}|<>"'\`]|$)`, 'gm')
  const beforeInline = result
  result = result.replace(inlineRegex, `#${neo}`)
  const inlineCount = countOccurrences(beforeInline, inlineRegex)
  totalOccurrences += inlineCount

  if (totalOccurrences === 0) return null
  return { occurrences: totalOccurrences, newContent: result }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function countOccurrences(text: string, regex: RegExp): number {
  const flags = regex.flags.includes('g') ? regex.flags : regex.flags + 'g'
  const r = new RegExp(regex.source, flags)
  let count = 0
  while (r.exec(text) !== null) count++
  return count
}
