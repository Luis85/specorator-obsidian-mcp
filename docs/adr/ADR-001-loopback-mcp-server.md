---
id: ADR-001
title: In-process loopback MCP server
status: accepted
date: 2026-05-24
references:
  - src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts
  - src/plugin/main.ts
---

# ADR-001 — In-process loopback MCP server

## Decision

The plugin runs a Model Context Protocol (MCP) server in-process inside Obsidian, exposing the vault as a typed agent tool surface over loopback HTTP.

Three commitments shape the implementation in `ObsidianMcpServerAdapter`:

1. **Loopback HTTP transport on a fixed configurable port.** A Node `http.Server` binds to `127.0.0.1:<settings.port>` (default `7842`); the adapter rejects requests whose `Host` header is not `127.0.0.1` or `localhost` (HTTP 421). Each request is handled by a fresh `McpServer` from `@modelcontextprotocol/sdk` connected to a `StreamableHTTPServerTransport` with no session ID. `getConnectionConfig()` returns `{ transport: 'http', url: 'http://127.0.0.1:<port>/mcp' }`.

2. **Tool registration is grouped, not scattered.** Seven register-functions split tools into vault, metadata, links, canvas, bases, cli.read, and cli groups. Every write tool goes through `PermissionGate.resolve(toolName, params)` before touching the vault. Read tools call port methods directly.

3. **Server is disabled by default; lifecycle is demand-driven.** `main.ts` exposes two command-palette commands ("Start MCP server" / "Stop MCP server"). The adapter is constructed and started only when the user runs the start command. The server does not open a localhost listener on every Obsidian startup.

| State         | How reached                                    |
| ------------- | ---------------------------------------------- |
| Off (default) | Plugin loads; no adapter constructed           |
| On            | User runs "Start MCP server"                   |
| Off again     | User runs "Stop MCP server", or plugin unloads |

## Rationale

- **Native (in-process) over external sidecar.** An MCP server that lives inside the plugin shares vault access through `VaultPort` and respects every narrow-port invariant — overwrite protection, vault-path normalisation, settings — without re-authenticating or reimplementing rules. An external sidecar would need its own auth boundary and a copy of the same logic.
- **Loopback-only listener with a `Host`-header gate.** Binding to `127.0.0.1` is the OS-level seal. Checking the `Host` header rejects DNS-rebinding-style attempts where a remote attacker tricks a browser into sending a request to a local socket. The request body would be HTTP/1.1 valid but `Host` would not be `localhost`.
- **Fixed configurable port (not dynamic `0`).** The upstream design used `127.0.0.1:0` so the OS picks a free port. This plugin uses a user-configured fixed port (default `7842`) so MCP clients can be preconfigured without re-reading `getConnectionConfig()`. Port collisions are surfaced as `EADDRINUSE` on start; the user changes the port in settings.
- **Per-request `McpServer` instance.** Each HTTP request constructs a new `McpServer` and `StreamableHTTPServerTransport`; this matches the transport's stateless-session model (`sessionIdGenerator: undefined`) and avoids leaking listener state across calls.
- **Direct writes through `PermissionGate`, not a proposal queue.** The upstream design queued every write for human approval. This plugin replaces that with a per-tool `allow`/`ask`/`deny` settings model (see ADR-002) that is more composable: reads can be pre-approved globally, writes ask by default, and dangerous tools like `cli.execute` default to deny.

## Consequences

- The plugin opens a localhost listener while loaded **and** started. The bind is loopback-only and the `Host` header gate is mandatory.
- A port conflict on start surfaces as an `EADDRINUSE` error. The user resolves it by changing `settings.port` and restarting.
- Tool surface is closed to module-side registration. A new agent-callable tool goes in the appropriate `register*Tools` function; it is not dynamically injectable.
- The MCP server starts after plugin load and stops on `onunload`. Tool calls that race the very start or end of the plugin lifecycle see "server not started" errors from `getConnectionConfig()`.
- Tools that depend on Obsidian-only APIs (`MetadataCachePort`, `CanvasPort`) work because those ports are real adapters in production and mocked in tests; the MCP server itself does not import `obsidian` directly.

## Alternatives considered

- **stdio transport (subprocess pipes).** Rejected: Obsidian is the parent process; spawning a child to host the MCP server reverses the natural dependency direction, complicates lifecycle (who restarts whom), and breaks vault access without a serialisation layer between processes.
- **WebSocket transport.** Rejected: HTTP+SSE via `StreamableHTTPServerTransport` is the documented transport for `@modelcontextprotocol/sdk` and matches MCP client expectations without bespoke framing.
- **Dynamic port (`0`).** Considered and rejected for this plugin: a fixed default port lets clients be preconfigured in a stable config file. The host-header gate already provides the primary protection; a dynamic port adds indirection without proportional security benefit on a single-user desktop.
- **Letting modules register tools.** Rejected: the agent capability surface is a security-relevant contract. Centralising it in the `register*Tools` functions keeps the audit story tractable.
