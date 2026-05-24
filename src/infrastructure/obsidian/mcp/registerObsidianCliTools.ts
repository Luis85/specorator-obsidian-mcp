import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { PermissionGate } from '@/application/mcp/PermissionGate'
import { ok, deny } from './shared'

/** Minimal surface of Obsidian's App.commands we need to execute commands. */
export interface CommandExecutorPort {
  executeCommandById(id: string): boolean
}

/** Minimal surface of Obsidian's App required by this registrar. */
export interface CliApp {
  commands: CommandExecutorPort
}

export function registerObsidianCliTools(
  server: McpServer,
  deps: { app: CliApp; gate: PermissionGate },
): void {
  const { app, gate } = deps

  server.registerTool(
    'cli.execute',
    {
      description:
        'Execute an Obsidian command palette command by its id. ' +
        'This tool defaults to "deny" mode in settings; opt in explicitly. ' +
        'Returns { executed: true } on success, { executed: false } when the command was not found.',
      inputSchema: {
        commandId: z.string().describe('Obsidian command id, e.g. "editor:save-file"'),
      },
    },
    async ({ commandId }) => {
      const d = await gate.resolve('cli.execute', { commandId })
      if (d.decision === 'deny') {
        return deny(d.reason)
      }
      const executed = app.commands.executeCommandById(commandId)
      return ok({ executed, commandId })
    },
  )
}
