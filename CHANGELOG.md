# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.3] — 2026-05-26

### Added

- `audit.tail` — read the last N entries from the MCP audit log (`.specorator/audit-log.jsonl`) for diagnosing permission decisions and tool-call history.
- `audit.diff` — compare current audit findings against a stored JSON baseline (from `audit.export`); returns added/resolved/unchanged per check category.
- `vault.stats` — lightweight vault size statistics: total file count, total bytes, and per-extension count + bytes breakdown (uses `getFileStats`, no content reads).
- `metadata.search` — new `contains` operator for substring match on string fields and element match on array fields.
- "Show audit log" command palette command — opens the audit log in the default app for quick inspection.
- ADR-005: catalog install lifecycle.
- 5 new glossary entries: audit-log, auto-start, batching, scan-gate, tool-call-audit.

### Security

- `saveSettings` now invalidates session-allow cache when tool modes are tightened.
- `cli.run` shell-metacharacter prefix validator — rejects commands that begin with shell operator characters.
- `redactParams` strips `code` and `script` fields before logging.
- Port range validation — settings tab rejects ports outside 1024–65535.
- `ObsidianConfirmModalAdapter` deduplicates in-flight modals for the same tool call.

### Changed

- LoggerPort wired into `ObsidianMcpServerAdapter` server lifecycle and `AutoRegister` — structured log entries replace bare `console.*` calls; error objects preserved.
- Audit log rotates at 5 MB.
- `vault.move` partial-failure paths logged via LoggerPort.
- Manual start command errors surfaced via LoggerPort.
- Build-catalog script validates frontmatter before writing `catalog/index.json`.
- Verify chain optimised — lint precedes typecheck to surface formatting errors first.

### Fixed

- README namespace count corrected (52 tools).
- `pathDenyList` default behaviour documented in README.
- `autoStart` added to Quick Start section of README.
- Catalog `requires[]` corrections.
- Clickable README link in Settings tab.
- `ConsentModal` Cancel button wired correctly.
- Search box repositioned in Settings tab.
- Empty-platform warning shown when no MCP client is selected in AutoRegister settings.
- Session-allow tooltip text updated.
- Jump-to-catalog anchor in Settings tab.

## [0.2.2] — 2026-05-25

### Added

- `autoStart` setting — when enabled, the MCP server starts automatically on plugin load (default off). Available in Settings → Server.
- **Tool-call audit log** — every MCP tool invocation appends to `.specorator/audit-log.jsonl` with tool name, decision, reason, and redacted params for forensic visibility.
- `fundingUrl` in `manifest.json` pointing at GitHub Sponsors.

### Security

- **Default `pathDenyList` now blocks `.specorator/**`, `.claude/hooks/**`, and `.claude/hooks/hooks.json`.**
  Previously the default deny-list was empty, leaving the audit-log sidecar and auto-executed hook files accessible via MCP tools.
  Existing installs that have never customised `pathDenyList` will inherit the new defaults on the next plugin load (0.2.2).
- Hook scan gate: installer validates hook entries before registration.
- AutoRegister hash-record prevents replay of stale config entries.
- Session-allow invalidation on server restart.
- Scanner additions: HTML embeds, IDN homograph, dilution, allowed-tools wildcard patterns.
- Audit-log race condition fixed (atomic append).

### Fixed

- canvas.list SDK breakage.
- HookConsentModal now displays full hook entry.
- Residual `console.log` calls removed.
- `outputSchema` + `okStructured` wired for `audit.report`, `canvas.read`, `links.*`, `frontmatter.set`.
- Catalog `requires[]` corrections.

### Changed

- Status bar lists registered MCP clients.
- Scrollable modals with Cancel buttons on all ask flows.
- First-run nudge for unconfigured installs.
- Deregister MCP clients on plugin unload.
- `DEFAULT_TOOL_MODES` grouped by namespace for readability.
- Verify chain reordered; lint rules tightened.
- CONTRIBUTING.md expanded with catalog authoring guide and common failure modes.
- Batching + pool helpers for audit/graph tools; event-loop yield prevents Obsidian UI jank; `maxFiles` budget.

## [0.2.1] — 2026-05-25

### Fixed

- Build pipeline: prettier ignores generated `catalog/index.json` so `verify` gate stays green on develop.

## [0.2.0] — 2026-05-25

### Added

- `audit.report` — one-shot vault health audit returning orphans, dead-end links, unresolved links, and tag stats in a single server-side call. Accepts `checks: string[]` to scope which checks run. Mode: `allow`. (ADR-003)
- `audit.export` — run a vault audit and write a Markdown report (and optional JSON baseline) to the vault. Mode: `ask`.
- `graph.stats` — vault-wide link-graph statistics (node count, edge count, density). Mode: `allow`.
- `graph.orphans` — notes with no incoming or outgoing links. Mode: `allow`.
- `graph.deadends` — notes with outgoing links that resolve but have no further outgoing links. Mode: `allow`.
- `frontmatter.set` — set or update a single frontmatter key (dot-path) in one note. Mode: `ask`.
- `frontmatter.query` — aggregate frontmatter values across the vault; group-by, filter, or count by field. Mode: `allow`.
- `note.patch` — surgical heading/block/frontmatter/eof edit. Anchors: `{ type: 'heading', value }`, `{ type: 'block', value }`, `{ type: 'frontmatter', value }` (dot-path), `{ type: 'eof' }`. Ops: `append`, `prepend`, `replace`. Returns `{ path, bytesChanged, newHash }`. Returns error when anchor is not found — never silently no-ops. Mode: `ask`.
- `vault.hash` — returns SHA-256 hex hash and byte size of a vault file. Use before calling `vault.write` with `mode:'overwrite'` to obtain the required `expectedHash`. Mode: `allow`.
- `vault.walk` — walk the vault tree and return paths with optional glob filter and metadata. Mode: `allow`.
- `links.unresolved` — list all unresolved wikilinks in the vault. Mode: `allow`.
- `tags.rename` — bulk rename a tag across all vault notes, replacing inline `#tag` occurrences and frontmatter `tags:` array entries. Default `dryRun:true` returns the plan without writing. Mode: `ask`.
- `attachments.orphans` — find unreferenced media files (non-.md/.canvas/.base) by scanning all text files for wikilink and Markdown embeds. Returns orphan paths and byte sizes. Mode: `allow`.
- `cli.screenshot` — capture a screenshot of the Obsidian window via the CLI. Mode: `ask`.
- `cli.run` — spawn the `obsidian` CLI binary with arbitrary command and arguments; opt in via `cliRunAllowedPrefixes`. Mode: `deny`.
- `cli.daily_note` — open or create today's daily note via the CLI. Mode: `ask`.
- `cli.workspace_load` — load a named workspace layout via the CLI. Mode: `ask`.
- `cli.template_insert` — insert a template into the active note via the CLI. Mode: `ask`.
- `cli.open_file` — open a vault file in Obsidian via the CLI. Mode: `ask`.
- `cli.reload` — reload Obsidian via the CLI. Mode: `ask`.
- `cli.eval` — execute arbitrary JavaScript in Obsidian's renderer context; registered only when `developerMode` is enabled. Mode: `deny`.
- `bases.views` — list views defined in a `.base` file via `obsidian base:views`. Mode: `allow`.
- `bases.query` — execute a view in a `.base` file; format=json/md/paths/csv. Mode: `allow`.
- `bases.read` — read the raw YAML content of a `.base` file from the vault. Mode: `allow`.
- `bases.create` — create a new note through a base view via `obsidian base:create`. Mode: `ask`.
- `cliRunAllowedPrefixes` setting — separate prefix allow-list for `cli.run` (distinct from `cliExecuteAllowedPrefixes`).
- `obsidianBinPath` setting — override path to the `obsidian` CLI binary; empty string auto-detects via PATH and platform defaults.
- `developerMode` setting — when true, registers `cli.eval`. Requires a server restart after toggling.
- **Restart MCP server** command palette command.
- Modal countdown timer — shows time remaining until auto-deny.
- Modal friendly summary — human-readable description of the tool call with collapsed JSON params and optional `currentContent` field.
- Status bar tooltip — describes server state; click opens settings tab.
- Settings UI groups tool-mode dropdowns by namespace (vault, metadata, frontmatter, note, links, graph, tags, attachments, audit, canvas, bases, cli).

### Changed

- BREAKING: `vault.write` now requires an explicit `mode` parameter (default `'create'`). Mode `'create'` refuses to overwrite an existing file (returns `file_exists` error). Mode `'overwrite'` requires `expectedHash` (SHA-256 of current content) and returns `hash_mismatch` if it does not match, or `expected_hash_required` if omitted. Mode `'patch'` returns `not_implemented` — use `note.patch` instead. **Migration:** call `vault.hash` to obtain the current hash, then pass `mode:'overwrite'` and `expectedHash` to overwrite. Callers that previously relied on silent overwrite must be updated. (ADR-004)
- BREAKING: `bases.*` tools rewritten to delegate to official Obsidian CLI `base:*` commands. `bases.filter` removed — use `bases.query` with a properly configured view instead. `bases.list` now returns `.base` file paths (previously returned arbitrary frontmatter records). Requires the Bases core plugin to be enabled.
- Tool descriptions updated for clarity across all tool groups.
- Modal button hierarchy: trust-granting actions (Allow Once, Allow for Session) are primary; Deny is secondary.

### Fixed

- Vault path normalisation — rejects `..` traversal and absolute paths before any vault operation.
- Atomic config writes — temp file + rename to avoid partial writes to `~/.claude.json` and other client configs.
- Origin header gate — rejects cross-origin browser requests (DNS-rebinding defence complement).
- Schema drift causing "Output validation error: no structured content" on certain tool calls when `outputSchema` was declared but the response used `ok()` instead of `okStructured()`.

### Security

- Bundle sourcemaps stripped from production builds.
- Path traversal guard applied to every path-shaped parameter before vault dispatch.
- DNS-rebinding defence: Host-header gate (`421 Misdirected Request`) plus Origin header gate.
- `vault.write` overwrite requires `expectedHash` — surfaces concurrent-edit conflicts and prevents blind overwrite. (ADR-004)
- Permission gate receives minimal params for write tools (no large content fields in modal).
- `cli.eval` registered only when `developerMode` is explicitly enabled; defaults to `deny` even when registered.

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

[Unreleased]: https://github.com/Luis85/specorator-obsidian-mcp/compare/0.2.3...HEAD
[0.2.3]: https://github.com/Luis85/specorator-obsidian-mcp/compare/0.2.2...0.2.3
[0.2.2]: https://github.com/Luis85/specorator-obsidian-mcp/compare/0.2.1...0.2.2
[0.2.1]: https://github.com/Luis85/specorator-obsidian-mcp/compare/0.2.0...0.2.1
[0.2.0]: https://github.com/Luis85/specorator-obsidian-mcp/compare/0.1.0...0.2.0
[0.1.0]: https://github.com/Luis85/specorator-obsidian-mcp/releases/tag/0.1.0
