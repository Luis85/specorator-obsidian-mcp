# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `vault.search` — case-insensitive substring search over vault contents with excerpts, optionally scoped to a folder.
- `vault.list_recursive` — recursively enumerate all files under a folder.
- `metadata.search` — find files by tag or frontmatter field=value.
- `canvas.list` — list all `.canvas` files in the vault or under a folder.
- `bases.filter` — filter frontmatter records by field/op/value criteria with AND semantics.
- `cli.execute` prefix allowlist — opt in to command palette execution per command-id prefix.
- Modal countdown timer — shows time remaining until auto-deny.
- Modal friendly summary — human-readable description of the tool call with collapsed JSON params and optional `currentContent` field.
- Status bar tooltip — describes server state; click opens settings tab.
- **Restart MCP server** command palette command.

### Changed

- Tool descriptions updated for clarity across all tool groups.
- Modal button hierarchy: trust-granting actions (Allow Once, Allow for Session) are primary; Deny is secondary.
- Settings UI groups tool-mode dropdowns by namespace (vault, metadata, links, canvas, bases, cli).

### Fixed

- Vault path normalization — rejects `..` traversal and absolute paths before any vault operation.
- Atomic config writes — temp file + rename to avoid partial writes to `~/.claude.json` and other client configs.
- Origin header gate — rejects cross-origin browser requests (DNS-rebinding defence complement).

### Security

- Bundle sourcemaps stripped from production builds.
- Path traversal guard applied to every path-shaped parameter before vault dispatch.
- DNS-rebinding defence: Host-header gate (`421 Misdirected Request`) plus Origin header gate.

## [0.1.0] — 2026-05-24

- Initial release.
- In-process MCP server over loopback HTTP with Host-header gate.
- Fixed configurable port (default 7842).
- Seven tool groups: vault, metadata, links, canvas, bases, cli.read, cli.execute.
- Permission gate with allow/ask/deny modes per tool, session-allow caching, path deny-list, ask-timeout default-deny.
- Obsidian modal adapter for ask flow.
- Server disabled by default; start/stop via command palette.
- Status bar item shows running port.
- Auto-register MCP server URL with Claude CLI (default), Claude Desktop, Cursor on server start; deregister on stop. Opt-in toggles per client in settings.

[Unreleased]: https://github.com/Luis85/specorator-obsidian-mcp/compare/0.1.0...HEAD
[0.1.0]: https://github.com/Luis85/specorator-obsidian-mcp/releases/tag/0.1.0
