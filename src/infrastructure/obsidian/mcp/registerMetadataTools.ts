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
      outputSchema: { frontmatter: z.record(z.string(), z.unknown()) },
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
      outputSchema: { tags: z.record(z.string(), z.number()) },
    },
    async () => ok({ tags: metadata.getAllTags() }),
  )

  server.registerTool(
    'metadata.headings',
    {
      description:
        'Get all headings from a vault note. Returns { headings: Array<{ heading: string, level: number }> }. Empty array when the note has no headings or the metadata cache has no entry for the path.',
      inputSchema: { path: z.string().describe('Vault-relative path') },
      outputSchema: {
        headings: z.array(
          z.object({ heading: z.string(), level: z.number() }).passthrough(),
        ),
      },
    },
    async ({ path }) => {
      const snapshot = metadata.getFileMetadata(path)
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
      outputSchema: { resolved: z.string().nullable() },
    },
    async ({ linktext, sourcePath }) =>
      ok({ resolved: metadata.getFirstLinkpathDest(linktext, sourcePath) }),
  )
}
