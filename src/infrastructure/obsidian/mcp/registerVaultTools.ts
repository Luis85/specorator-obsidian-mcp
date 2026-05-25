import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { VaultPort } from '@/domain/ports'
import type { PermissionGate } from '@/application/mcp/PermissionGate'
import { normalizeVaultPath, isVaultRoot } from '@/domain/shared/VaultPath'
import { joinVaultPath, ok, okStructured, deny, err, collectFiles } from './shared'
import { matchGlob } from '@/domain/shared/matchGlob'

function unsafePath(msg: string): { isError: true; content: [{ type: 'text'; text: string }] } {
  return err(`unsafe path: ${msg}`)
}

export function registerVaultTools(
  server: McpServer,
  deps: { vault: VaultPort; gate: PermissionGate },
): void {
  const { vault, gate } = deps

  server.registerTool(
    'vault.read',
    {
      description:
        'Read the full UTF-8 text content of a vault file. Returns { content: string }. Throws when the file does not exist; call vault.exists first to avoid the error path.',
      inputSchema: { path: z.string().describe('Vault-relative path') },
      outputSchema: { content: z.string() },
    },
    async ({ path }) => {
      const norm = normalizeVaultPath(path)
      if (!norm.ok) return unsafePath(norm.error.message)
      return okStructured({ content: await vault.readFile(norm.value) })
    },
  )

  server.registerTool(
    'vault.list',
    {
      description: 'List files and immediate subfolders in a vault folder',
      inputSchema: { folder: z.string().describe('Vault-relative folder path') },
      outputSchema: { files: z.array(z.string()), folders: z.array(z.string()) },
    },
    async ({ folder }) => {
      const norm = normalizeVaultPath(folder)
      if (!norm.ok) return unsafePath(norm.error.message)
      const safeFolder = norm.value
      const [files, subfolderNames] = await Promise.all([
        vault.listFiles(safeFolder),
        vault.listFolders(safeFolder),
      ])
      const folders = subfolderNames.map((sub) => joinVaultPath(safeFolder, sub))
      return okStructured({ files, folders })
    },
  )

  server.registerTool(
    'vault.exists',
    {
      description: 'Check whether a file exists in the vault',
      inputSchema: { path: z.string().describe('Vault-relative path') },
      outputSchema: { exists: z.boolean() },
    },
    async ({ path }) => {
      const norm = normalizeVaultPath(path)
      if (!norm.ok) return unsafePath(norm.error.message)
      return okStructured({ exists: await vault.fileExists(norm.value) })
    },
  )

  server.registerTool(
    'vault.write',
    {
      description:
        'Write (overwrite or create) a vault file. Content is capped at 10 MB. Returns { written: true, path }.',
      inputSchema: {
        path: z.string().describe('Vault-relative path'),
        content: z.string().max(10_000_000).describe('Full file content to write (max 10 MB)'),
      },
    },
    async ({ path, content }) => {
      const norm = normalizeVaultPath(path)
      if (!norm.ok) return unsafePath(norm.error.message)
      const safePath = norm.value
      const d = await gate.resolve('vault.write', { path: safePath, contentSize: content.length })
      if (d.decision === 'deny') {
        return deny(d.reason)
      }
      await vault.writeFile(safePath, content)
      return ok({ written: true, path: safePath })
    },
  )

  server.registerTool(
    'vault.delete',
    {
      description: 'Delete a file from the vault',
      inputSchema: { path: z.string().describe('Vault-relative path') },
    },
    async ({ path }) => {
      const norm = normalizeVaultPath(path)
      if (!norm.ok) return unsafePath(norm.error.message)
      const safePath = norm.value
      const d = await gate.resolve('vault.delete', { path: safePath })
      if (d.decision === 'deny') {
        return deny(d.reason)
      }
      await vault.deleteFile(safePath)
      return ok({ deleted: true, path: safePath })
    },
  )

  server.registerTool(
    'vault.move',
    {
      description:
        "Move (rename) a vault file. Non-atomic: implemented as write-then-delete. If the delete fails after the write, the file will exist at both 'from' and 'to'. Returns { moved: true, from, to }.",
      inputSchema: {
        from: z.string().describe('Current vault-relative path'),
        to: z.string().describe('Destination vault-relative path'),
      },
    },
    // Non-atomic: read + write + delete. If deleteFile throws after writeFile
    // succeeds, the file will exist at both 'from' and 'to'. Callers must treat
    // a returned error as indeterminate state. VaultPort offers no native move.
    async ({ from, to }) => {
      const normFrom = normalizeVaultPath(from)
      if (!normFrom.ok) return unsafePath(normFrom.error.message)
      const normTo = normalizeVaultPath(to)
      if (!normTo.ok) return unsafePath(normTo.error.message)
      const safeFrom = normFrom.value
      const safeTo = normTo.value
      const d = await gate.resolve('vault.move', { path: safeFrom, from: safeFrom, to: safeTo })
      if (d.decision === 'deny') {
        return deny(d.reason)
      }
      const content = await vault.readFile(safeFrom)
      await vault.writeFile(safeTo, content)
      await vault.deleteFile(safeFrom)
      return ok({ moved: true, from: safeFrom, to: safeTo })
    },
  )

  server.registerTool(
    'vault.createFolder',
    {
      description: 'Create a folder in the vault',
      inputSchema: { path: z.string().describe('Vault-relative folder path') },
    },
    async ({ path }) => {
      const norm = normalizeVaultPath(path)
      if (!norm.ok) return unsafePath(norm.error.message)
      const safePath = norm.value
      const d = await gate.resolve('vault.createFolder', { path: safePath })
      if (d.decision === 'deny') {
        return deny(d.reason)
      }
      await vault.createFolder(safePath)
      return ok({ created: true, path: safePath })
    },
  )

  server.registerTool(
    'vault.search',
    {
      description:
        'Search vault note contents for a query string. Returns up to 100 matches with file path + excerpt (~120 chars around the match). Optionally scoped to a folder. Substring match, case-insensitive.',
      inputSchema: {
        query: z.string().min(1).describe('Substring to search for (case-insensitive)'),
        folder: z.string().optional().describe('Vault-relative folder to limit the search'),
      },
      outputSchema: {
        matches: z.array(z.object({ path: z.string(), excerpt: z.string() })),
      },
    },
    async ({ query, folder }) => {
      if (folder !== undefined && !isVaultRoot(folder)) {
        const norm = normalizeVaultPath(folder)
        if (!norm.ok) return unsafePath(norm.error.message)
        const matches = await vault.searchFiles(query, norm.value)
        return okStructured({ matches })
      }
      const matches = await vault.searchFiles(query)
      return okStructured({ matches })
    },
  )

  server.registerTool(
    'vault.list_recursive',
    {
      description:
        "Recursively list all files under a folder. Returns flat array of vault-relative paths. For whole-vault scans use folder='' or '/'. Convenience wrapper — equivalent to vault.walk with glob='**/*'.",
      inputSchema: {
        folder: z.string().describe("Vault-relative folder path. Use '' or '/' for vault root."),
      },
      outputSchema: { files: z.array(z.string()) },
    },
    async ({ folder }) => {
      // Allow empty / root-equivalent folder to mean vault root.
      if (isVaultRoot(folder)) {
        const files = await collectFiles(vault, '')
        return okStructured({ files })
      }
      const norm = normalizeVaultPath(folder)
      if (!norm.ok) return unsafePath(norm.error.message)
      const files = await collectFiles(vault, norm.value)
      return okStructured({ files })
    },
  )

  server.registerTool(
    'vault.walk',
    {
      description:
        "Glob-filtered recursive file listing. Supports ** (multi-segment) and * (single-segment) wildcards. Examples: '**/*.md', 'notes/**/*.canvas', '*.json'. Supersedes vault.list_recursive for pattern-filtered walks. Returns up to `limit` paths (default 1000, max 10000); truncated=true when the limit is hit.",
      inputSchema: {
        glob: z
          .string()
          .describe(
            "Glob pattern (e.g. '**/*.md', 'notes/**/*.canvas'). ** matches across path separators, * matches within a single segment.",
          ),
        folder: z.string().optional().describe('Vault-relative search root (default: vault root).'),
        limit: z.number().int().min(1).max(10000).default(1000),
      },
      outputSchema: {
        files: z.array(z.string()),
        count: z.number().int(),
        truncated: z.boolean(),
      },
    },
    async ({ glob, folder = '', limit }) => {
      const searchRoot = isVaultRoot(folder)
        ? ''
        : (() => {
            const norm = normalizeVaultPath(folder)
            if (!norm.ok) return null
            return norm.value
          })()

      if (searchRoot === null) {
        return unsafePath(folder)
      }

      const allFiles = await collectFiles(vault, searchRoot)
      const matched: string[] = []
      let truncated = false

      for (const path of allFiles) {
        if (matchGlob(glob, path)) {
          if (matched.length >= limit) {
            truncated = true
            break
          }
          matched.push(path)
        }
      }

      return okStructured({ files: matched, count: matched.length, truncated })
    },
  )
}
