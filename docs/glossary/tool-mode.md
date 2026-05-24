---
term: 'tool mode'
aliases: ['ToolMode', 'allow', 'ask', 'deny']
category: technical
status: accepted
version: '0.1.0'
related:
  - src/domain/settings/PluginSettings.ts
  - docs/adr/ADR-002-permission-modes.md
last_updated: 2026-05-25
---

# Tool mode

The `ToolMode` type (`src/domain/settings/PluginSettings.ts`) is a three-value enum that governs how the permission gate responds to a specific MCP tool call.

| Mode    | Behaviour                                                                                      |
| ------- | ---------------------------------------------------------------------------------------------- |
| `allow` | The tool runs immediately without user interaction.                                            |
| `ask`   | An Obsidian modal opens, presenting "Allow once / Allow for session / Deny". Timeout → `deny`. |
| `deny`  | The tool is rejected immediately and an MCP error envelope is returned.                        |

Each tool has a default mode in `DEFAULT_TOOL_MODES` (e.g. reads default to `allow`, writes to `ask`, `cli.execute` to `deny`). The user can override individual tools in plugin settings.

The active mode for a call is resolved by `PermissionGate.resolve()` — see [permission-gate](./permission-gate.md) for the full resolution order.

## Source of truth

`DEFAULT_TOOL_MODES` in `src/domain/settings/PluginSettings.ts` is the canonical registry. Tests assert exact-equality against it to prevent unregistered tools from silently falling back to `defaultMode`.
