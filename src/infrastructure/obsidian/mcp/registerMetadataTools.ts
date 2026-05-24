import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { MetadataCachePort, VaultPort } from '@/domain/ports'
import { ok, err, parseFrontmatter } from './shared'

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
        headings: z.array(z.object({ heading: z.string(), level: z.number() }).passthrough()),
      },
    },
    async ({ path }) => {
      const snapshot = metadata.getFileMetadata(path)
      const headings = snapshot?.headings ?? []
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

  server.registerTool(
    'metadata.search',
    {
      description:
        'Find files by tag or by frontmatter field=value. Specify either { tag } OR { field, value }. Returns flat array of matching vault paths.',
      inputSchema: {
        tag: z.string().optional().describe('Tag to search for (e.g. "#todo" or "todo")'),
        field: z.string().optional().describe('Frontmatter field name'),
        value: z
          .union([z.string(), z.number(), z.boolean(), z.null()])
          .optional()
          .describe('Frontmatter field value'),
      },
      outputSchema: { paths: z.array(z.string()) },
    },
    async ({ tag, field, value }) => {
      const hasTag = tag !== undefined
      const hasField = field !== undefined
      // Exactly one of tag or field+value must be present
      if (hasTag && hasField) {
        return err('Specify either tag or field+value, not both')
      }
      if (!hasTag && !hasField) {
        return err('Specify either tag or field+value')
      }
      if (hasTag) {
        const paths = await metadata.searchByTag(tag!)
        return ok({ paths })
      }
      // field+value search
      const paths = await metadata.searchByFrontmatter(field!, value !== undefined ? value : null)
      return ok({ paths })
    },
  )
}
