import { PermissionGate } from '@/application/mcp/PermissionGate'
import {
  DEFAULT_SETTINGS,
  DEFAULT_TOOL_MODES,
  type ToolMode,
} from '@/domain/settings/PluginSettings'
import type { ConfirmModalPort } from '@/domain/ports'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

/** Construct a PermissionGate that allows everything (every tool override → 'allow'). */
export function makeAllowGate(modal: ConfirmModalPort): PermissionGate {
  const toolModes: Record<string, ToolMode> = Object.fromEntries(
    Object.keys(DEFAULT_TOOL_MODES).map((k) => [k, 'allow']),
  )
  return new PermissionGate(
    { getSettings: () => ({ ...DEFAULT_SETTINGS, defaultMode: 'allow', toolModes }) },
    modal,
  )
}

export interface RegisteredTool {
  handler: (args: unknown) => Promise<unknown>
}

export interface ServerInternal {
  _registeredTools: Record<string, RegisteredTool>
}

/**
 * Retrieve a registered tool's handler from an McpServer without scattering
 * inline SDK-internals casts across every test file.
 *
 * Throws if the tool is not registered, making test failures explicit.
 */
export function getHandler(
  server: McpServer,
  toolName: string,
): (args: unknown) => Promise<unknown> {
  const tools = (server as unknown as ServerInternal)._registeredTools
  const t = tools[toolName]
  if (!t) throw new Error(`Tool not registered: ${toolName}`)
  return t.handler
}

/**
 * Retrieve all registered tools from an McpServer.
 * Useful for registration-count assertions.
 */
export function getRegisteredTools(server: McpServer): Record<string, RegisteredTool> {
  return (server as unknown as ServerInternal)._registeredTools
}
