import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import type { VaultPort } from '@/domain/ports'
import type { PermissionGate } from '@/application/mcp/PermissionGate'
import { normalizeVaultPath } from '@/domain/shared/VaultPath'
import { applyPatch } from '@/application/mcp/patch'
import { deny, err, okStructured } from './shared'

function sha256hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

export function registerPatchTools(
  server: McpServer,
  deps: { vault: VaultPort; gate: PermissionGate },
): void {
  const { vault, gate } = deps

  // -------------------------------------------------------------------------
  // note.patch
  // -------------------------------------------------------------------------
  server.registerTool(
    'note.patch',
    {
      description:
        'Surgical edit of a vault note at a specific anchor (heading, block reference, frontmatter key, or end-of-file). ' +
        'Supports append (after anchor), prepend (before anchor), and replace (overwrite anchor content). ' +
        'Returns the SHA-256 hash of the resulting file. ' +
        'Returns an error when the anchor is not found rather than silently no-opping.',
      inputSchema: {
        path: z.string().describe('Vault-relative path to the note'),
        anchor: z.discriminatedUnion('type', [
          z.object({
            type: z.literal('heading'),
            value: z.string().describe('Exact heading text without leading #'),
          }),
          z.object({
            type: z.literal('block'),
            value: z.string().describe('Block reference id (e.g. "xyz" for ^xyz)'),
          }),
          z.object({
            type: z.literal('frontmatter'),
            value: z
              .string()
              .describe(
                'Frontmatter key path; nested via dot, e.g. "project.status". ' +
                  'append concatenates strings or pushes onto arrays; ' +
                  'prepend inserts before existing value; ' +
                  'replace sets the key to the new value.',
              ),
          }),
          z.object({
            type: z.literal('eof'),
            value: z.string().optional().describe('Unused — eof has no selector value'),
          }),
        ]),
        op: z
          .enum(['append', 'prepend', 'replace'])
          .describe('append: insert after anchor; prepend: insert before; replace: overwrite'),
        content: z.string().describe('Text to insert or use as replacement'),
      },
      outputSchema: {
        path: z.string(),
        bytesChanged: z.number().int(),
        newHash: z.string().describe('SHA-256 hex of the resulting file content'),
      },
    },
    async ({ path, anchor, op, content }) => {
      const norm = normalizeVaultPath(path)
      if (!norm.ok) return err(`unsafe path: ${norm.error.message}`)
      const safePath = norm.value

      const d = await gate.resolve('note.patch', { path: safePath })
      if (d.decision === 'deny') return deny(d.reason)

      let originalContent: string
      try {
        originalContent = await vault.readFile(safePath)
      } catch {
        return err(`file not found: ${safePath}`)
      }

      const patchResult = applyPatch(
        originalContent,
        anchor as Parameters<typeof applyPatch>[1],
        op,
        content,
      )
      if (!patchResult.ok) {
        return err(`${patchResult.error.code}: ${patchResult.error.message}`)
      }

      await vault.writeFile(safePath, patchResult.result.content)
      const newHash = sha256hex(patchResult.result.content)

      return okStructured({
        path: safePath,
        bytesChanged: patchResult.result.bytesChanged,
        newHash,
      })
    },
  )

  // -------------------------------------------------------------------------
  // vault.hash
  // -------------------------------------------------------------------------
  server.registerTool(
    'vault.hash',
    {
      description:
        'Return the SHA-256 hash (hex) and byte size of a vault file. ' +
        'Use this to obtain the expectedHash required by vault.write mode:"overwrite".',
      inputSchema: {
        path: z.string().describe('Vault-relative path'),
      },
      outputSchema: {
        hash: z.string().describe('SHA-256 hex of the file content'),
        bytes: z.number().int().describe('UTF-8 byte size of the file'),
      },
    },
    async ({ path }) => {
      const norm = normalizeVaultPath(path)
      if (!norm.ok) return err(`unsafe path: ${norm.error.message}`)
      const safePath = norm.value

      let content: string
      try {
        content = await vault.readFile(safePath)
      } catch {
        return err(`file not found: ${safePath}`)
      }

      const encoder = new TextEncoder()
      const bytes = encoder.encode(content).length
      const hash = sha256hex(content)

      return okStructured({ hash, bytes })
    },
  )
}
