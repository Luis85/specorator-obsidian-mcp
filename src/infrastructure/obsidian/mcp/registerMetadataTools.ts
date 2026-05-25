import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { MetadataCachePort, VaultPort } from '@/domain/ports'
import type { PermissionGate } from '@/application/mcp/PermissionGate'
import { normalizeVaultPath, isVaultRoot } from '@/domain/shared/VaultPath'
import { okStructured, err, deny, parseFrontmatter, applyFrontmatterUpdate } from './shared'
import { queryFrontmatter } from '@/application/mcp/frontmatterQuery'
import type { Condition, ConditionOp } from '@/application/mcp/frontmatterQuery'

export function registerMetadataTools(
  server: McpServer,
  deps: { metadata: MetadataCachePort; vault: VaultPort; gate: PermissionGate },
): void {
  const { metadata, vault, gate } = deps

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
        return okStructured({ frontmatter: snapshot.frontmatter })
      }
      const content = await vault.readFile(path)
      return okStructured({ frontmatter: parseFrontmatter(content) })
    },
  )

  server.registerTool(
    'metadata.tags',
    {
      description: 'Get the tag → count map across the entire vault',
      inputSchema: {},
      outputSchema: { tags: z.record(z.string(), z.number()) },
    },
    async () => okStructured({ tags: metadata.getAllTags() }),
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
      return okStructured({ headings })
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
      okStructured({ resolved: metadata.getFirstLinkpathDest(linktext, sourcePath) }),
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
        return okStructured({ paths })
      }
      // field+value search
      const paths = await metadata.searchByFrontmatter(field!, value !== undefined ? value : null)
      return okStructured({ paths })
    },
  )

  server.registerTool(
    'frontmatter.set',
    {
      description:
        'Atomically set or delete a single frontmatter field in a vault note. Pass value=null to delete the field. Returns the previous and new values. Gated: mode=ask.',
      inputSchema: {
        path: z.string().describe('Vault-relative path to the note'),
        field: z.string().min(1).describe('Frontmatter key name'),
        value: z.unknown().describe('Any JSON-serializable value; null deletes the field'),
      },
      outputSchema: {
        path: z.string(),
        field: z.string(),
        previousValue: z.unknown().optional(),
        newValue: z.unknown().optional(),
      },
    },
    async ({ path, field, value }) => {
      const norm = normalizeVaultPath(path)
      if (!norm.ok) return err(`unsafe path: ${norm.error.message}`)
      const safePath = norm.value

      const d = await gate.resolve('frontmatter.set', { path: safePath })
      if (d.decision === 'deny') return deny(d.reason)

      const content = await vault.readFile(safePath)
      const existing = parseFrontmatter(content)
      const previousValue = Object.prototype.hasOwnProperty.call(existing, field)
        ? existing[field]
        : undefined

      if (value === null) {
        // Delete the field
        const updates: Record<string, unknown> = { ...existing }
        delete updates[field]
        // Re-serialize from scratch: applyFrontmatterUpdate merges, so we need
        // to write the full frontmatter without the field directly.
        const { stringify: stringifyYaml } = await import('yaml')
        const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content)
        const bodyStart = fmMatch ? fmMatch[0].length : 0
        await vault.writeFile(
          safePath,
          `---\n${stringifyYaml(updates)}---\n${content.slice(bodyStart)}`,
        )
        return okStructured({ path: safePath, field, previousValue, newValue: undefined })
      }

      // Set/update the field
      await applyFrontmatterUpdate(vault, safePath, { [field]: value })
      return okStructured({ path: safePath, field, previousValue, newValue: value })
    },
  )

  // ── frontmatter.query ──────────────────────────────────────────────────

  const ConditionSchema = z.object({
    field: z.string(),
    op: z.enum(['eq', 'neq', 'contains', 'in', 'exists', 'gt', 'lt']),
    value: z
      .union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.unknown())])
      .optional(),
  })

  server.registerTool(
    'frontmatter.query',
    {
      description:
        'Find notes whose frontmatter matches compound conditions (AND/OR). Operators: eq, neq, contains (substring/array includes), in (field value is element of array), exists (field present), gt/lt (numeric). Scoped to folder or vault root.',
      inputSchema: {
        folder: z
          .string()
          .optional()
          .describe('Vault-relative folder to search (default: vault root).'),
        where: z.array(ConditionSchema).min(1).describe('Array of conditions to evaluate.'),
        op: z.enum(['AND', 'OR']).default('AND').describe('Logical combinator for conditions.'),
      },
      outputSchema: {
        matches: z.array(
          z.object({
            path: z.string(),
            frontmatter: z.record(z.string(), z.unknown()),
          }),
        ),
        count: z.number().int(),
      },
    },
    async ({ folder = '', where, op }) => {
      const resolvedFolder = isVaultRoot(folder)
        ? ''
        : (() => {
            const norm = normalizeVaultPath(folder)
            if (!norm.ok) return null
            return norm.value
          })()

      if (resolvedFolder === null) {
        return err('unsafe path')
      }

      const conditions: Condition[] = where.map((c) => ({
        field: c.field,
        op: c.op as ConditionOp,
        value: c.value,
      }))

      const result = await queryFrontmatter({ vault, metadata }, resolvedFolder, conditions, op)
      return okStructured(result as unknown as Record<string, unknown>)
    },
  )
}
