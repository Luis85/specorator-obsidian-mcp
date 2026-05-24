import { PermissionGate } from '@/application/mcp/PermissionGate'
import {
  DEFAULT_SETTINGS,
  DEFAULT_TOOL_MODES,
  type ToolMode,
} from '@/domain/settings/PluginSettings'
import type { ConfirmModalPort } from '@/domain/ports'

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
