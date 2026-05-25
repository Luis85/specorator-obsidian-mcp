import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ObsidianCliPort, VaultPort } from '@/domain/ports'
import type { PermissionGate } from '@/application/mcp/PermissionGate'
import { normalizeVaultPath } from '@/domain/shared/VaultPath'
import { ok, deny, err } from './shared'

export function registerBasesTools(
  server: McpServer,
  deps: { cli: ObsidianCliPort; vault: VaultPort; gate: PermissionGate },
): void {
  const { cli, vault, gate } = deps

  // ── bases.list ────────────────────────────────────────────────────────────
  server.registerTool(
    'bases.list',
    {
      description:
        'List all .base files in the vault by delegating to the official Obsidian CLI ' +
        '(`obsidian bases`). Returns { bases: string[] } — one vault-relative path per entry. ' +
        'Requires the Bases core plugin to be enabled.',
      inputSchema: {
        folder: z
          .string()
          .optional()
          .describe('Optional vault-relative folder to filter results client-side.'),
      },
    },
    async ({ folder }) => {
      const result = await cli.run({ command: 'bases', timeoutMs: 30_000 })
      if (result.exitCode !== 0) {
        return err(`bases.list failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`)
      }
      let bases = result.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
      if (folder !== undefined && folder !== '') {
        const prefix = folder.replace(/\/+$/, '') + '/'
        bases = bases.filter((p) => p.startsWith(prefix) || p === folder)
      }
      return ok({ bases })
    },
  )

  // ── bases.views ───────────────────────────────────────────────────────────
  server.registerTool(
    'bases.views',
    {
      description:
        'List the views defined in a .base file by delegating to the official Obsidian CLI ' +
        '(`obsidian base:views`). Provide exactly one of "file" (name-resolved) or "path" ' +
        '(exact vault-relative path). Returns { views: string } — raw text output from the CLI.',
      inputSchema: {
        file: z
          .string()
          .optional()
          .describe('Base file name (wikilink-resolved). Mutually exclusive with path.'),
        path: z
          .string()
          .optional()
          .describe('Exact vault-relative path to the .base file. Mutually exclusive with file.'),
      },
    },
    async ({ file, path }) => {
      const hasFile = file !== undefined && file !== ''
      const hasPath = path !== undefined && path !== ''
      if (!hasFile && !hasPath) {
        return err('exactly one of "file" or "path" must be provided')
      }
      if (hasFile && hasPath) {
        return err('provide either "file" or "path", not both')
      }

      const args: Record<string, string> = {}
      if (hasFile) args.file = file!
      else args.path = path!

      const result = await cli.run({ command: 'base:views', args, timeoutMs: 30_000 })
      if (result.exitCode !== 0) {
        return err(
          `bases.views failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`,
        )
      }
      return ok({ views: result.stdout })
    },
  )

  // ── bases.query ───────────────────────────────────────────────────────────
  server.registerTool(
    'bases.query',
    {
      description:
        'Execute a view in a .base file by delegating to the official Obsidian CLI ' +
        '(`obsidian base:query`). Provide exactly one of "file" or "path". ' +
        'format=json (default) tries to parse the output as JSON; ' +
        'format=paths splits lines into a string array; ' +
        'format=md and format=csv return raw stdout. ' +
        'Returns { result: unknown, format: string }. ' +
        'Requires the Bases core plugin to be enabled.',
      inputSchema: {
        file: z
          .string()
          .optional()
          .describe('Base file name (wikilink-resolved). Mutually exclusive with path.'),
        path: z
          .string()
          .optional()
          .describe('Exact vault-relative path to the .base file. Mutually exclusive with file.'),
        view: z.string().optional().describe('View name within the base file.'),
        format: z
          .enum(['json', 'md', 'paths', 'csv'])
          .default('json')
          .describe('Output format. Default: json.'),
      },
    },
    async ({ file, path, view, format }) => {
      const hasFile = file !== undefined && file !== ''
      const hasPath = path !== undefined && path !== ''
      if (!hasFile && !hasPath) {
        return err('exactly one of "file" or "path" must be provided')
      }
      if (hasFile && hasPath) {
        return err('provide either "file" or "path", not both')
      }

      const args: Record<string, string> = { format }
      if (hasFile) args.file = file!
      else args.path = path!
      if (view !== undefined && view !== '') args.view = view

      const result = await cli.run({ command: 'base:query', args, timeoutMs: 30_000 })
      if (result.exitCode !== 0) {
        return err(
          `bases.query failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`,
        )
      }

      const stdout = result.stdout

      if (format === 'json') {
        try {
          const parsed: unknown = JSON.parse(stdout)
          return ok({ result: parsed, format })
        } catch {
          return ok({
            result: stdout,
            format,
            warning: 'CLI output was not valid JSON — returning raw stdout',
          })
        }
      }

      if (format === 'paths') {
        const paths = stdout
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 0)
        return ok({ result: paths, format })
      }

      // md / csv — raw
      return ok({ result: stdout, format })
    },
  )

  // ── bases.read ────────────────────────────────────────────────────────────
  server.registerTool(
    'bases.read',
    {
      description:
        'Read the raw YAML content of a .base file directly from the vault. ' +
        'Returns { content: string }. No CLI required — reads via the vault port.',
      inputSchema: {
        path: z
          .string()
          .describe('Vault-relative path to the .base file (e.g. "views/tasks.base").'),
      },
    },
    async ({ path }) => {
      const norm = normalizeVaultPath(path)
      if (!norm.ok) return err(`unsafe path: ${norm.error.message}`)
      try {
        const content = await vault.readFile(norm.value)
        return ok({ content })
      } catch (e) {
        return err(`bases.read failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    },
  )

  // ── bases.create ──────────────────────────────────────────────────────────
  server.registerTool(
    'bases.create',
    {
      description:
        'Create a new note through a base view by delegating to the official Obsidian CLI ' +
        '(`obsidian base:create`). Requires the Bases core plugin to be enabled. ' +
        'Returns { created: true, stdout: string }.',
      inputSchema: {
        name: z.string().min(1).describe('Name for the new note.'),
        file: z
          .string()
          .optional()
          .describe('Base file name (wikilink-resolved). Mutually exclusive with path.'),
        path: z
          .string()
          .optional()
          .describe('Exact vault-relative path to the .base file. Mutually exclusive with file.'),
        view: z.string().optional().describe('View within the base file to use for creation.'),
        content: z.string().optional().describe('Initial content for the new note.'),
      },
    },
    async ({ name, file, path, view, content }) => {
      const d = await gate.resolve('bases.create', { name, file, path })
      if (d.decision === 'deny') return deny(d.reason)

      const args: Record<string, string> = { name }
      const hasFile = file !== undefined && file !== ''
      const hasPath = path !== undefined && path !== ''
      if (hasFile) args.file = file!
      if (hasPath) args.path = path!
      if (view !== undefined && view !== '') args.view = view
      if (content !== undefined) args.content = content

      const result = await cli.run({ command: 'base:create', args, timeoutMs: 30_000 })
      if (result.exitCode !== 0) {
        return err(
          `bases.create failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`,
        )
      }
      return ok({ created: true, stdout: result.stdout })
    },
  )
}
