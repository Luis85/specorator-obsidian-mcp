---
term: 'path deny list'
aliases: ['pathDenyList', 'path-deny-list']
category: technical
status: accepted
version: '0.1.0'
related:
  - src/domain/settings/PluginSettings.ts
  - src/application/mcp/PermissionGate.ts
  - src/domain/shared/normalizeVaultPath.ts
last_updated: 2026-05-25
---

# Path deny list

The `pathDenyList` field in `PluginSettings` is an ordered list of glob patterns that unconditionally reject any MCP tool call whose path-shaped parameter matches. It is checked **first** in `PermissionGate.resolve()`, before per-tool modes and session-allows — no override can bypass it.

**Supported patterns:** standard glob syntax via the `minimatch` library (e.g. `.obsidian/**`, `**/private/**`, `secrets.md`). Patterns are matched against the vault-relative, normalized path.

**Overlap with `normalizeVaultPath`:** `normalizeVaultPath` (`src/domain/shared/normalizeVaultPath.ts`) rejects absolute paths and `../` traversals before the gate is reached. The deny list operates on already-normalized paths — it does not need to handle traversal attacks.

**Multi-param tools:** tools with multiple path params (e.g. `vault.move` has `from` and `to`) check each param independently. If either matches the deny list the call is rejected.

See [ADR-002](../adr/ADR-002-permission-modes.md) for rationale on why path-sensitivity has highest priority.
