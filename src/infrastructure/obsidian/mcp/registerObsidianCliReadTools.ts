import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ok } from './shared'

/** Minimal surface of Obsidian's App.commands we need for read tools. */
export interface CommandsPort {
  listCommands(): Array<{ id: string; name: string }>
}

/** Minimal surface of Obsidian's App required by this registrar. */
export interface CliReadApp {
  commands: CommandsPort
}

export function registerObsidianCliReadTools(server: McpServer, deps: { app: CliReadApp }): void {
  const { app } = deps

  server.registerTool(
    'cli.read.list',
    {
      description: 'List all available Obsidian command palette commands',
      inputSchema: {},
    },
    async () => {
      const commands = app.commands.listCommands()
      return ok({ commands })
    },
  )

  server.registerTool(
    'cli.read.find',
    {
      description:
        'Find Obsidian command palette commands matching a search string (case-insensitive substring match on id or name)',
      inputSchema: {
        query: z.string().describe('Substring to search for in command id or name'),
      },
    },
    async ({ query }) => {
      const lower = query.toLowerCase()
      const commands = app.commands
        .listCommands()
        .filter(
          (cmd) => cmd.id.toLowerCase().includes(lower) || cmd.name.toLowerCase().includes(lower),
        )
      return ok({ commands })
    },
  )
}
