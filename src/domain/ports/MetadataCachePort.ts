import type { Unsubscriber } from './shared'

export interface HeadingSnapshot {
  heading: string
  level: number
}

export interface FileMetadataSnapshot {
  path: string
  tags: string[]
  frontmatter: Record<string, unknown>
  links: string[]
  embeds: string[]
  headings?: HeadingSnapshot[]
}

export interface MetadataCachePort {
  getFileMetadata(path: string): FileMetadataSnapshot | null
  getBacklinks(path: string): string[]
  getResolvedLinks(sourcePath: string): Record<string, number>
  getAllTags(): Record<string, number>
  /**
   * Resolve a wikilink (e.g. "Page Name" or "folder/page") to its absolute vault path
   * relative to the given source. Returns null if unresolved.
   * MUST use Obsidian's in-process metadata cache. Never shell out.
   */
  getFirstLinkpathDest(linktext: string, sourcePath: string): string | null
  onMetadataChanged(handler: (path: string) => void): Unsubscriber
  /** Return paths of all files that have the given tag (e.g. "#todo"). */
  searchByTag(tag: string): Promise<string[]>
  /** Return paths of all files whose frontmatter has field===value. */
  searchByFrontmatter(field: string, value: unknown): Promise<string[]>
}
