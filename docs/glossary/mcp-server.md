---
term: 'MCP server'
aliases: ['Obsidian MCP server', 'ObsidianMcpServer', 'native MCP server']
category: technical
status: accepted
version: '0.1.0'
related:
  - docs/adr/ADR-001-loopback-mcp-server.md
  - docs/adr/ADR-002-permission-modes.md
last_updated: 2026-05-24
---

# MCP server

The native Obsidian MCP (Model Context Protocol) server that this plugin runs inside the plugin process, with full access to Obsidian's internal APIs. It is the mechanism through which MCP clients — Claude CLI, Claude Desktop, or any `@modelcontextprotocol/sdk`-compatible client — interact with the vault.

The MCP server exposes a structured tool surface: vault read/write, frontmatter manipulation, wikilink graph traversal, Canvas operations, Bases queries, and Obsidian command palette access.

## Why native

Running the MCP server inside the plugin (not as a separate process or REST intermediary) gives it full access to Obsidian's internal APIs: `MetadataCache`, `Canvas`, `Bases`, and the complete `App` and `Vault` object graph. This is the difference between an MCP server that knows about Obsidian and one that _is_ Obsidian.

## Tool catalogue (summary)

- **Vault tools** — `vault.read`, `vault.write`, `vault.list`, `vault.exists`, `vault.delete`, `vault.move`, `vault.createFolder`
- **Metadata tools** — `metadata.frontmatter`, `metadata.tags`, `metadata.headings`, `metadata.linkpath`
- **Links tools** — `links.backlinks`, `links.outgoing`, `links.bfs`
- **Canvas tools** — `canvas.read`, `canvas.write`
- **Bases tools** — `bases.list`, `bases.views`, `bases.query`, `bases.read`, `bases.create` (delegates to official `obsidian base:*` CLI commands; requires Bases core plugin)
- **CLI read tools** — `cli.read.list`, `cli.read.find`
- **CLI execute tool** — `cli.execute` (default: deny; opt-in via settings)

## Permission model

Write tools resolve a permission mode (`allow` / `ask` / `deny`) via `PermissionGate` before touching the vault. Read tools bypass the gate. See [ADR-002](../adr/ADR-002-permission-modes.md) for the full resolution order.

## Full specification

See [ADR-001](../adr/ADR-001-loopback-mcp-server.md) for the loopback HTTP design and lifecycle decisions.
