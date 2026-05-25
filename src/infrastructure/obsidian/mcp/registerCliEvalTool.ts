import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ObsidianCliPort } from '@/domain/ports'
import type { PermissionGate } from '@/application/mcp/PermissionGate'
import { ok, deny, err } from './shared'

export function registerCliEvalTool(
  server: McpServer,
  deps: { cli: ObsidianCliPort; gate: PermissionGate; developerMode: boolean },
): void {
  if (!deps.developerMode) return // tool not registered unless dev mode is on

  server.registerTool(
    'cli.eval',
    {
      description:
        'DANGEROUS: Execute arbitrary JavaScript in the running Obsidian renderer context. Requires developer mode enabled in settings. Default mode: deny.',
      inputSchema: {
        code: z
          .string()
          .min(1)
          .describe('JavaScript to execute. Access to `app`, plugin APIs, etc.'),
      },
    },
    async ({ code }) => {
      const decision = await deps.gate.resolve('cli.eval', { code: code.slice(0, 200) })
      if (decision.decision === 'deny') return deny(decision.reason)

      const result = await deps.cli.run({
        command: 'eval',
        args: { code },
        timeoutMs: 30_000,
      })

      if (result.exitCode !== 0) {
        return err(`eval failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`)
      }
      return ok({ stdout: result.stdout, stderr: result.stderr })
    },
  )
}
