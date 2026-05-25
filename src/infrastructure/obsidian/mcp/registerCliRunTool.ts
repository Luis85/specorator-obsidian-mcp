import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ObsidianCliPort } from '@/domain/ports'
import type { PermissionGate } from '@/application/mcp/PermissionGate'
import { ok, deny } from './shared'

export function registerCliRunTool(
  server: McpServer,
  deps: { cli: ObsidianCliPort; gate: PermissionGate },
): void {
  const { cli, gate } = deps

  server.registerTool(
    'cli.run',
    {
      description:
        'Invoke the official Obsidian CLI binary with an arbitrary command and arguments. ' +
        'Defaults to deny mode in settings; opt in per-command-prefix via the cli.run allow-list. ' +
        'NOTE: cli.execute (in-process command palette) and cli.run (external binary) are distinct tools — ' +
        'see CONTRIBUTING.md for the naming rationale. ' +
        'Returns { stdout, stderr, exitCode }.',
      inputSchema: {
        command: z
          .string()
          .min(1)
          .describe('Obsidian CLI command (e.g. "version", "search", "base:query").'),
        args: z
          .record(z.string(), z.union([z.string(), z.boolean()]))
          .optional()
          .describe('Key/value args passed as --key=value or standalone --key for booleans.'),
        flags: z.array(z.string()).optional().describe('Trailing flags like ["--copy"].'),
        timeoutMs: z
          .number()
          .int()
          .min(1000)
          .max(120000)
          .default(30000)
          .describe('Timeout in milliseconds (1000–120000). Default 30000.'),
        vault: z.string().optional().describe('Optional vault selector passed to the CLI.'),
      },
    },
    async ({ command, args, flags, timeoutMs, vault }) => {
      const d = await gate.resolve('cli.run', { command })
      if (d.decision === 'deny') {
        return deny(d.reason)
      }

      const result = await cli.run({ command, args, flags, timeoutMs, vault })
      return ok({ stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode })
    },
  )
}
