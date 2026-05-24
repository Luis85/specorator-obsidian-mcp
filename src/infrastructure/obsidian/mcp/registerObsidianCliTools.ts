import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ok } from './shared'

/** Minimal surface of Obsidian's App.commands we need to execute commands. */
export interface CommandExecutorPort {
  executeCommandById(id: string): boolean
}

/** Minimal surface of Obsidian's App required by this registrar. */
export interface CliApp {
  commands: CommandExecutorPort
}

export function registerObsidianCliTools(server: McpServer, deps: { app: CliApp }): void {
  const { app } = deps

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
      const executed = app.commands.executeCommandById(commandId)
      return ok({ executed, commandId })
    },
  )
}
