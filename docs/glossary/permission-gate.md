---
term: 'permission gate'
aliases: ['PermissionGate']
category: technical
status: accepted
version: '0.1.0'
related:
  - src/application/mcp/PermissionGate.ts
  - docs/adr/ADR-002-permission-modes.md
last_updated: 2026-05-25
---

# Permission gate

The `PermissionGate` class (`src/application/mcp/PermissionGate.ts`) sits between every mutating MCP tool call and the vault. Before any write executes, the tool calls `gate.resolve(toolName, params)` and checks the returned decision.

Resolution order:

1. If `params.path` (or `params.to`, `params.from`, etc.) matches a glob in `pathDenyList` → `deny`.
2. If a session-allow decision is cached for `toolName` → `allow`.
3. If `toolModes[toolName]` is set → that mode.
4. Else → `defaultMode`.

`allow` proceeds immediately. `deny` returns an MCP error envelope without touching the vault. `ask` opens an Obsidian modal (see [`ConfirmModalPort`](../glossary/tool-mode.md)) and waits up to `askTimeoutMs` (default 30 000 ms); timeout defaults to `deny`.

Read-only tools do not call the gate.

## Full specification

See [ADR-002](../adr/ADR-002-permission-modes.md) for rationale and full resolution-order detail.
