/**
 * Pure-domain helper for attachment / media orphan detection.
 *
 * Text files (.md, .canvas, .base) are scanned for embed references.
 * Media files (everything else) are cross-referenced against those embeds.
 * Files not referenced anywhere are "orphans".
 */

/** File extensions considered "text/note" files whose embeds are scanned. */
const TEXT_EXTENSIONS = new Set(['.md', '.canvas', '.base'])

/**
 * Return true if the given vault-relative path is a text/note file.
 */
export function isTextFile(path: string): boolean {
  const dot = path.lastIndexOf('.')
  if (dot === -1) return false
  return TEXT_EXTENSIONS.has(path.slice(dot).toLowerCase())
}

/**
 * Extract all referenced attachment names/paths from text file content.
 *
 * Handles:
 *   - Wikilink embeds:  `![[filename]]`, `![[path/to/file.png]]`, `![[file|alt]]`
 *   - Markdown embeds:  `![alt](path/to/file.png)`
 *
 * Returns a Set of raw reference strings (as written in the file).
 */
export function extractEmbeds(content: string): Set<string> {
  const refs = new Set<string>()

  // Wikilink embeds: ![[ref]] or ![[ref|alias]]
  const wikiRegex = /!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
  let m: RegExpExecArray | null
  while ((m = wikiRegex.exec(content)) !== null) {
    const ref = m[1].trim()
    if (ref) refs.add(ref)
  }

  // Standard Markdown embeds: ![alt](path)
  const mdRegex = /!\[[^\]]*\]\(([^)]+)\)/g
  while ((m = mdRegex.exec(content)) !== null) {
    const ref = decodeURIComponent(m[1].trim())
    if (ref) refs.add(ref)
  }

  return refs
}

export interface OrphanEntry {
  path: string
  bytes: number
}

/**
 * Given a full file list and a map of content per text file, compute orphan
 * media files.
 *
 * `contentMap` should contain the text content of each text file.
 * `statsMap` maps path → bytes.
 */
export function computeOrphans(
  allFiles: string[],
  contentMap: Map<string, string>,
  statsMap: Map<string, number>,
): OrphanEntry[] {
  // Collect all referenced filenames/paths from all text files
  const allRefs = new Set<string>()
  for (const content of contentMap.values()) {
    for (const ref of extractEmbeds(content)) {
      allRefs.add(ref)
      // Also add basename for wikilink-style refs that don't include path
      const slash = ref.lastIndexOf('/')
      if (slash !== -1) {
        allRefs.add(ref.slice(slash + 1))
      }
    }
  }

  const orphans: OrphanEntry[] = []
  for (const path of allFiles) {
    if (isTextFile(path)) continue
    // Check if this media file is referenced
    const basename = path.split('/').pop() ?? path
    if (allRefs.has(path) || allRefs.has(basename)) continue
    const bytes = statsMap.get(path) ?? 0
    orphans.push({ path, bytes })
  }
  return orphans
}
