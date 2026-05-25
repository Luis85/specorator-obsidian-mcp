# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `note.patch` — surgical heading/block/frontmatter/eof edit. Anchors: `{ type: 'heading', value }`, `{ type: 'block', value }`, `{ type: 'frontmatter', value }` (dot-path), `{ type: 'eof' }`. Ops: `append`, `prepend`, `replace`. Returns `{ path, bytesChanged, newHash }`. Returns error when anchor is not found — never silently no-ops. Mode: `ask`.
- `vault.hash` — returns SHA-256 hex hash and byte size of a vault file. Use before calling `vault.write` with `mode:'overwrite'` to obtain the required `expectedHash`. Mode: `allow`.
- `tags.rename` — bulk rename a tag across all vault notes, replacing inline `#tag` occurrences and frontmatter `tags:` array entries. Default `dryRun:true` returns the plan without writing. Mode: `ask`.
- `attachments.orphans` — find unreferenced media files (non-.md/.canvas/.base) by scanning all text files for wikilink and Markdown embeds. Returns orphan paths and byte sizes. Mode: `allow`.
- `audit.export` — run a vault audit and write a Markdown report (and optional JSON baseline) to the vault. Mode: `ask`.

### Changed

- BREAKING: `vault.write` now requires an explicit `mode` parameter (default `'create'`). Mode `'create'` refuses to overwrite an existing file (returns `file_exists` error). Mode `'overwrite'` requires `expectedHash` (SHA-256 of current content) and returns `hash_mismatch` if it does not match or `expected_hash_required` if omitted. Mode `'patch'` returns `not_implemented` — use `note.patch` instead. **Migration:** call `vault.hash` to obtain the current hash, then pass `mode:'overwrite'` and `expectedHash` to overwrite. Callers that previously relied on silent overwrite must be updated.

- `vault.search` — case-insensitive substring search over vault contents with excerpts, optionally scoped to a folder.
- `vault.list_recursive` — recursively enumerate all files under a folder.
- `metadata.search` — find files by tag or frontmatter field=value.
- `canvas.list` — list all `.canvas` files in the vault or under a folder.
- `cli.execute` prefix allowlist — opt in to command palette execution per command-id prefix.
- Modal countdown timer — shows time remaining until auto-deny.
- Modal friendly summary — human-readable description of the tool call with collapsed JSON params and optional `currentContent` field.
- Status bar tooltip — describes server state; click opens settings tab.
- **Restart MCP server** command palette command.

### Changed

- BREAKING: `bases.*` tools rewritten to delegate to official Obsidian CLI `base:*` commands. `bases.filter` removed (use `bases.query` with a properly configured view instead). `bases.list` now returns `.base` file paths (previously returned arbitrary frontmatter records). New tools: `bases.views`, `bases.query`, `bases.read`, `bases.create`. Requires the Bases core plugin to be enabled.
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
