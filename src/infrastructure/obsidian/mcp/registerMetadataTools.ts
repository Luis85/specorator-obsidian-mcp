import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { MetadataCachePort, VaultPort } from '@/domain/ports'
import { ok, parseFrontmatter } from './shared'

export function registerMetadataTools(
  server: McpServer,
  deps: { metadata: MetadataCachePort; vault: VaultPort },
): void {
  const { metadata, vault } = deps

  server.registerTool(
    'metadata.frontmatter',
    {
      description: 'Get the YAML frontmatter fields for a vault note',
      inputSchema: { path: z.string().describe('Vault-relative path') },
    },
    async ({ path }) => {
      // Prefer live metadata cache snapshot when available, fall back to parsing raw file.
      const snapshot = metadata.getFileMetadata(path)
      if (snapshot !== null) {
        return ok({ frontmatter: snapshot.frontmatter })
      }
      const content = await vault.readFile(path)
      return ok({ frontmatter: parseFrontmatter(content) })
    },
  )

  server.registerTool(
    'metadata.tags',
    {
      description: 'Get the tag → count map across the entire vault',
      inputSchema: {},
    },
    async () => ok({ tags: metadata.getAllTags() }),
  )

  server.registerTool(
    'metadata.headings',
    {
      description:
        'Get all headings from a vault note via the metadata cache (path, level, heading text)',
      inputSchema: { path: z.string().describe('Vault-relative path') },
    },
    async ({ path }) => {
      const snapshot = metadata.getFileMetadata(path)
      // FileMetadataSnapshot does not include a headings field — return the raw
      // snapshot for callers that know the structure; empty array when absent.
      const headings =
        snapshot !== null && 'headings' in snapshot
          ? (snapshot as unknown as { headings: unknown[] }).headings
          : []
      return ok({ headings })
    },
  )

  server.registerTool(
    'metadata.linkpath',
    {
      description:
        'Resolve a wikilink linktext to its absolute vault path. Returns null when unresolved.',
      inputSchema: {
        linktext: z.string().describe('Wikilink text, e.g. "Page Name" or "folder/page"'),
        sourcePath: z.string().describe('Source note the link is being resolved from'),
      },
    },
    async ({ linktext, sourcePath }) =>
      ok({ resolved: metadata.getFirstLinkpathDest(linktext, sourcePath) }),
  )
}
