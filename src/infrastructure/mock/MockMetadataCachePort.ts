import type {
  MetadataCachePort,
  FileMetadataSnapshot,
  HeadingSnapshot,
  Unsubscriber,
} from '@/domain/ports'

/**
 * In-memory {@link MetadataCachePort} for unit tests.
 */
export class MockMetadataCachePort implements MetadataCachePort {
  private readonly metadataMap = new Map<string, FileMetadataSnapshot>()
  private readonly backlinksMap = new Map<string, string[]>()
  private readonly resolvedLinksMap = new Map<string, Record<string, number>>()
  private tagsMap: Record<string, number> = {}
  private readonly linkpathDestMap = new Map<string, string>()
  private readonly metadataHandlers = new Set<(path: string) => void>()

  seedMetadata(path: string, snapshot: FileMetadataSnapshot): void {
    this.metadataMap.set(path, snapshot)
  }

  seedBacklinks(path: string, sources: string[]): void {
    this.backlinksMap.set(path, sources)
  }

  seedResolvedLinks(path: string, links: Record<string, number>): void {
    this.resolvedLinksMap.set(path, links)
  }

  seedTags(tags: Record<string, number>): void {
    this.tagsMap = { ...tags }
  }

  seedLinkpathDest(linktext: string, sourcePath: string, dest: string): void {
    this.linkpathDestMap.set(`${linktext}|${sourcePath}`, dest)
  }

  seedHeadings(path: string, headings: HeadingSnapshot[]): void {
    const existing = this.metadataMap.get(path)
    if (existing) {
      this.metadataMap.set(path, { ...existing, headings })
    } else {
      this.metadataMap.set(path, {
        path,
        tags: [],
        frontmatter: {},
        links: [],
        embeds: [],
        headings,
      })
    }
  }

  triggerMetadataChange(path: string): void {
    for (const handler of this.metadataHandlers) {
      handler(path)
    }
  }

  getFileMetadata(path: string): FileMetadataSnapshot | null {
    const snapshot = this.metadataMap.get(path)
    return snapshot !== undefined ? structuredClone(snapshot) : null
  }

  getBacklinks(path: string): string[] {
    return [...(this.backlinksMap.get(path) ?? [])]
  }

  getResolvedLinks(sourcePath: string): Record<string, number> {
    return { ...(this.resolvedLinksMap.get(sourcePath) ?? {}) }
  }

  getAllTags(): Record<string, number> {
    return { ...this.tagsMap }
  }

  getFirstLinkpathDest(linktext: string, sourcePath: string): string | null {
    return this.linkpathDestMap.get(`${linktext}|${sourcePath}`) ?? null
  }

  onMetadataChanged(handler: (path: string) => void): Unsubscriber {
    this.metadataHandlers.add(handler)
    return () => {
      this.metadataHandlers.delete(handler)
    }
  }

  async searchByTag(tag: string): Promise<string[]> {
    const results: string[] = []
    const normalised = tag.startsWith('#') ? tag : `#${tag}`
    for (const snapshot of this.metadataMap.values()) {
      if (snapshot.tags.some((t) => t === normalised)) {
        results.push(snapshot.path)
      }
    }
    return results
  }

  async searchByFrontmatter(field: string, value: unknown): Promise<string[]> {
    const results: string[] = []
    for (const snapshot of this.metadataMap.values()) {
      if (snapshot.frontmatter[field] === value) {
        results.push(snapshot.path)
      }
    }
    return results
  }
}
