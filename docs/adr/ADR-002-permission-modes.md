---
id: ADR-002
title: Settings-driven allow/ask/deny permission model
status: accepted
date: 2026-05-24
references:
  - src/application/mcp/PermissionGate.ts
  - src/domain/settings/PluginSettings.ts
---

# ADR-002 — Settings-driven allow/ask/deny permission model

## Decision

Every mutating MCP tool call resolves a permission mode (`allow` / `ask` / `deny`) via `PermissionGate.resolve(toolName, params)`. Resolution order:

1. If `params.path` matches any glob in `pathDenyList` → `deny`.
2. If a session-allow decision exists for `toolName` → `allow`.
3. If `toolModes[toolName]` is set → that mode.
4. Else → `defaultMode`.

`allow` runs the tool. `deny` returns an MCP error envelope. `ask` opens an Obsidian modal with three options: Allow once / Allow for session / Deny. Modal timeout (`askTimeoutMs`, default 30 000 ms) defaults to `deny`.

## Rationale

- **Per-tool overrides over a single switch.** Different tools carry very different risk (`vault.read` is harmless; `cli.execute` can run any command palette action). A single global default is too blunt.
- **`pathDenyList` precedence.** Path-shaped sensitivity (e.g. "never touch `**/private/**`") is orthogonal to per-tool risk and must win. Putting it first ensures no per-tool override can bypass a path deny.
- **Session-allow over click-fatigue.** When a user is mid-task and the same tool is called many times, asking each time is hostile. Session-allow caches the decision in memory until plugin reload.
- **Timeout-as-deny.** A modal that hangs forever blocks the agent indefinitely. Default-deny on timeout is safer than default-allow.
- **No persistent allow-list.** Decisions do not survive plugin reload. The agent re-asks on next session. This is intentional: the security context (which agent is running, which task) may have changed.

## Consequences

- Default behaviour is "ask" for writes — first-use friction, but explicit consent.
- `cli.execute` defaults to `deny`. Users who want it must change the setting explicitly. Documented prominently in README.
- The session-allow cache is per-tool, not per-path. A session-allow on `vault.write` permits writes to any path (subject to `pathDenyList`). This is a deliberate simplification.
- Tests must mock `ConfirmModalPort` — the Obsidian modal is not test-callable.

## Alternatives considered

- **No permission gate, raw writes.** Rejected: an MCP server with unguarded write tools is an unbounded delegation. Even on loopback, the user installing the plugin deserves a confirm flow by default.
- **Pre-approval list at install time.** Rejected: too restrictive (re-install to change) and bypasses ongoing user judgment.
- **Per-call diff preview.** Considered. Postponed to v0.2: useful for `vault.write` and `canvas.write` where the diff is visualisable, but not for `cli.execute`. Will be added as an opt-in setting later.
