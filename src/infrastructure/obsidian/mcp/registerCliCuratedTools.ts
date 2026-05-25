import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ObsidianCliPort } from '@/domain/ports'
import type { PermissionGate } from '@/application/mcp/PermissionGate'
import { normalizeVaultPath } from '@/domain/shared/VaultPath'
import { ok, deny, err } from './shared'

export function registerCliCuratedTools(
  server: McpServer,
  deps: { cli: ObsidianCliPort; gate: PermissionGate },
): void {
  const { cli, gate } = deps

  // ── cli.daily_note ──────────────────────────────────────────────────────────
  // TODO: If this command fails with 'unknown command', adjust to 'daily:open'.
  server.registerTool(
    'cli.daily_note',
    {
      description:
        "Open today's daily note in Obsidian. Creates it from the daily-notes template if missing.",
      inputSchema: {},
    },
    async () => {
      const d = await gate.resolve('cli.daily_note', {})
      if (d.decision === 'deny') return deny(d.reason)

      const result = await cli.run({ command: 'daily', timeoutMs: 30_000 })
      if (result.exitCode !== 0) {
        return err(
          `cli.daily_note failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`,
        )
      }
      return ok({ opened: true, stdout: result.stdout.trim() })
    },
  )

  // ── cli.workspace_load ──────────────────────────────────────────────────────
  server.registerTool(
    'cli.workspace_load',
    {
      description:
        'Load a named Obsidian workspace. Use cli.run with command="workspaces" first if you need to list available names.',
      inputSchema: {
        name: z.string().min(1).describe('Workspace name'),
      },
    },
    async ({ name }) => {
      const d = await gate.resolve('cli.workspace_load', { name })
      if (d.decision === 'deny') return deny(d.reason)

      const result = await cli.run({
        command: 'workspace:load',
        args: { name },
        timeoutMs: 30_000,
      })
      if (result.exitCode !== 0) {
        return err(
          `cli.workspace_load failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`,
        )
      }
      return ok({ loaded: true, name, stdout: result.stdout.trim() })
    },
  )

  // ── cli.template_insert ─────────────────────────────────────────────────────
  // TODO: If this command fails with 'unknown command', adjust to 'templates:insert'.
  server.registerTool(
    'cli.template_insert',
    {
      description:
        'Insert a named template into a file. The template must exist in the configured Templates folder.',
      inputSchema: {
        template: z.string().min(1).describe('Template name (without .md)'),
        file: z.string().optional().describe('Target file. Defaults to active note.'),
      },
    },
    async ({ template, file }) => {
      const d = await gate.resolve('cli.template_insert', { template, file })
      if (d.decision === 'deny') return deny(d.reason)

      const args: Record<string, string> = { template }
      if (file !== undefined) args.file = file

      const result = await cli.run({ command: 'template:insert', args, timeoutMs: 30_000 })
      if (result.exitCode !== 0) {
        return err(
          `cli.template_insert failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`,
        )
      }
      return ok({ inserted: true, template, file: file ?? null, stdout: result.stdout.trim() })
    },
  )

  // ── cli.open_file ───────────────────────────────────────────────────────────
  server.registerTool(
    'cli.open_file',
    {
      description:
        'Open a vault file in Obsidian. Specify either file (by name) or path (exact). Optionally open in a new tab.',
      inputSchema: {
        file: z.string().optional().describe('File name (wikilink-resolved)'),
        path: z.string().optional().describe('Exact vault-relative path'),
        newtab: z.boolean().optional().default(false),
      },
    },
    async ({ file, path, newtab }) => {
      // Exactly one of file/path must be provided
      const hasFile = file !== undefined && file !== ''
      const hasPath = path !== undefined && path !== ''
      if (!hasFile && !hasPath) {
        return err('exactly one of "file" or "path" must be provided')
      }
      if (hasFile && hasPath) {
        return err('provide either "file" or "path", not both')
      }

      // Reject .. traversal when path is used
      if (hasPath) {
        const norm = normalizeVaultPath(path!)
        if (!norm.ok) return err(`unsafe path: ${norm.error.message}`)
      }

      const d = await gate.resolve('cli.open_file', { file, path })
      if (d.decision === 'deny') return deny(d.reason)

      const args: Record<string, string | boolean> = {}
      if (hasFile) {
        args.file = file!
      } else {
        args.path = path!
      }
      if (newtab) args.newtab = true

      const result = await cli.run({ command: 'open', args, timeoutMs: 30_000 })
      if (result.exitCode !== 0) {
        return err(
          `cli.open_file failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`,
        )
      }
      return ok({ opened: true, stdout: result.stdout.trim() })
    },
  )

  // ── cli.reload ──────────────────────────────────────────────────────────────
  server.registerTool(
    'cli.reload',
    {
      description:
        'Reload the running Obsidian app. Use after installing/updating plugins or hot-fixing config.',
      inputSchema: {},
    },
    async () => {
      const d = await gate.resolve('cli.reload', {})
      if (d.decision === 'deny') return deny(d.reason)

      const result = await cli.run({ command: 'reload', timeoutMs: 30_000 })
      if (result.exitCode !== 0) {
        return err(`cli.reload failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`)
      }
      return ok({ reloaded: true, stdout: result.stdout.trim() })
    },
  )
}
