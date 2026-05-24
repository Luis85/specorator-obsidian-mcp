---
term: 'session allow'
aliases: ['session-allow', 'Allow for session', 'sessionAllowed']
category: technical
status: accepted
version: '0.1.0'
related:
  - src/application/mcp/PermissionGate.ts
  - docs/adr/ADR-002-permission-modes.md
last_updated: 2026-05-25
---

# Session allow

An in-memory, per-tool cache inside `PermissionGate` that records when a user selected "Allow for session" in the confirmation modal. While a session-allow entry exists for a tool, subsequent calls to that tool resolve to `allow` without opening the modal again.

**Lifetime:** the cache is scoped to the plugin's current load. It is cleared when the plugin unloads (i.e. Obsidian restarts or the plugin is disabled). Decisions do not survive a reload — the agent must ask again in the next session.

**Granularity:** session-allow is per tool name, not per path. A session-allow on `vault.write` permits writes to any path in the vault (subject to `pathDenyList` precedence). This is intentional: per-path granularity would require a more complex UI.

See [`PermissionGate`](./permission-gate.md) and [ADR-002](../adr/ADR-002-permission-modes.md) for the full resolution-order detail.
