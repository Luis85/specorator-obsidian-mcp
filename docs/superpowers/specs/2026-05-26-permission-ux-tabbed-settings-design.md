# Design: Permission UX + Tabbed Settings

Date: 2026-05-26
Status: approved (brainstorming)
Source proposal: `D:/TestVault/specs/Specorator — Permission & Settings UX Proposal.md`

## Summary

Three related improvements to the Specorator Obsidian MCP plugin, shipped as one feature:

1. **Permission UX** — reduce friction from the two permission-prompt layers an external agent hits, without weakening the destructive-op safety net.
2. **Tabbed settings** — split the single long settings scroll (`CombinedSettingsTab`) into four tabs: **Server / Permissions / Catalog / Advanced**.
3. **Codex auto-register** — give the Codex CLI agent the same one-click MCP access already offered for Claude CLI, Claude Desktop, and Cursor.

## Background & corrected root cause

The proposal attributes the `"denied: ask timeout"` error to the Claude Code harness prompt and proposes a `.claude/settings.json` allowlist as the fix. That is only half right.

There are **two** independent permission layers in the Claude-Code → plugin flow:

- **Layer A — Claude Code harness.** Prompts the user to approve an MCP tool call. Suppressed by an allowlist in the vault's `.claude/settings.json`.
- **Layer B — plugin's own gate.** `PermissionGate` (`src/application/mcp/PermissionGate.ts`) resolves each call against per-tool modes (`allow`/`ask`/`deny`). In `ask` mode it opens an **in-vault Obsidian modal**; if unanswered within `askTimeoutMs` (default 30 s) it auto-denies with reason `"ask timeout"` (`PermissionGate.ts:159`).

The exact string `"ask timeout"` is produced by **Layer B**, not the harness. So the proposal's allowlist fixes Layer A only. A complete fix addresses both layers. The user chose **both layers**.

### What already exists (do not rebuild)

- Per-tool `allow`/`ask`/`deny` modes (`DEFAULT_TOOL_MODES`, `src/domain/settings/PluginSettings.ts`): reads default `allow`, writes default `ask`, dangerous CLI (`cli.eval`/`cli.execute`/`cli.run`) default `deny`.
- Configurable `askTimeoutMs`, session-allow cache (`allow-session` modal choice), path deny-list, `cli.execute`/`cli.run` prefix allowlists.
- Audit log records **every** gate decision regardless of outcome (`PermissionGate.resolve` → `auditor.record`). The proposal's "Tier 2 = auto-allow **with audit trail**" is therefore satisfied automatically once a write tool is set to `allow`.
- Three presets in `src/application/settings/presets.ts`: `all-ask`, `safe-defaults`, `all-allow`.
- `CombinedSettingsTab` already consolidated two former sidebar entries into one (so we will not re-split into multiple `addSettingTab` calls).
- The catalog already manages `.claude/` content (skills, commands, agents, `hooks.json`) via `src/application/catalog/platforms.ts`, and gates writes behind a consent modal (`HookConsentModal`). Writing `.claude/settings.json` fits this precedent.

### The real gaps

- No **middle preset** between `safe-defaults` (writes prompt) and `all-allow` (everything silent). The proposal's Tier 1 + Tier 2 = "allow reads and safe writes, prompt only destructive ops."
- No way to populate the Layer-A allowlist from the plugin.
- Ask-timeout setting copy does not tell the user the timeout is the in-vault modal (Layer B), so the friction is mis-attributed.
- Settings are one long scroll; permission config is buried.

## Components

### Part A — Tabbed settings (Issue 2)

`CombinedSettingsTab` becomes a tab-bar host:

- New private field `activeTab: 'server' | 'permissions' | 'catalog' | 'advanced'` (default `'server'`), persisted across rerenders the same way `catalogSearchTerm` already is.
- `display()` renders: a row of tab `<button>`s (active one styled), then a content `<div>`. Clicking a tab sets `activeTab` and calls `display()`.
- The catalog tab keeps using the existing async `renderCatalogSettings`.

Refactor `src/plugin/settings.ts`: split the 450-line `renderMcpServerSettings` into focused free functions, each rendering into a passed `containerEl`:

| Function                           | Tab         | Contents                                                                                                                                                                                      |
| ---------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `renderServerTab`                  | Server      | status banner, port, auto-start, log level, CLI bin path, auto-register clients                                                                                                               |
| `renderPermissionsTab`             | Permissions | default mode, ask-timeout (clarified copy), preset buttons incl. new **Trusted writes**, tier legend, per-tool mode dropdowns grouped by namespace, **Generate Claude Code allowlist** button |
| (existing) `renderCatalogSettings` | Catalog     | workflow installer (unchanged)                                                                                                                                                                |
| `renderAdvancedTab`                | Advanced    | path deny-list, `cli.execute` prefixes, `cli.run` prefixes, developer mode                                                                                                                    |

The existing helpers `renderStatusBanner` and `renderPresetButtons` are reused/moved. The status banner's "Jump to Workflow catalog" anchor (which used `scrollIntoView`) is replaced by a handler that sets `activeTab = 'catalog'` and re-renders, since the catalog now lives on its own tab.

**Retire** the unused `SpecoratorMcpSettingsTab` class (defined in `settings.ts:437`, never instantiated, no test references). Removing it is part of this refactor.

### Part B — Trusted-writes preset (Issue 1, Layer B)

In `src/application/settings/presets.ts`:

- Extend `Preset` with `'trusted-writes'`.
- Add an exported constant `SAFE_WRITE_TOOLS` (the proposal's Tier 2):
  `vault.write`, `vault.createFolder`, `frontmatter.set`, `note.patch`, `tags.rename`, `canvas.write`, `bases.create`, `cli.daily_note`, `cli.open_file`, `cli.template_insert`.

  Note: internal dotted ids. `vault.createFolder` is included as a safe write even though the proposal's Tier-2 list omitted it (it is non-destructive and frequently needed before a write).

- `applyPreset(current, 'trusted-writes')`: start from `{ ...DEFAULT_TOOL_MODES }`, then set every tool in `SAFE_WRITE_TOOLS` to `allow`. Everything else keeps its default — so destructive ops stay `ask` (`vault.delete`, `vault.move`, `cli.reload`, `cli.screenshot`, `cli.workspace_load`, `audit.export`) and dangerous ops stay `deny` (`cli.eval`, `cli.execute`, `cli.run`). Pure function, no mutation (matches existing presets).

UI in `renderPermissionsTab`:

- Fourth preset button **"Trusted writes"** with tooltip: "Allow reads and safe writes; still prompt for delete/move and block shell-level tools." Placed between "Safe defaults" and "All allow (advanced)".
- **Tier legend**: a small static legend mapping each tier to its tools (Read / Safe write / Destructive / Blocked), so users understand what each preset and dropdown means. Tier membership derives from `SAFE_WRITE_TOOLS` + a `DESTRUCTIVE_TOOLS` list + the `deny`-by-default set, so legend and preset never drift.
- Ask-timeout setting `setDesc` updated to: "The **in-vault** confirmation modal auto-denies after this many seconds with no response. This is separate from the Claude Code approval prompt — see _Generate Claude Code allowlist_ below."

### Part C — Harness allowlist generator (Issue 1, Layer A)

New module `src/application/settings/claudeAllowlist.ts` (pure logic, testable without Obsidian):

- `ALLOWLISTED_TOOLS`: reads (every tool defaulting to `allow` in `DEFAULT_TOOL_MODES`) plus `SAFE_WRITE_TOOLS`.
- `toHarnessToolId(dotted: string): string` — maps `vault.write` → `mcp__specorator-obsidian-mcp__vault_write` (dots → underscores, prefixed with the server id from `manifest.json`). The server id is the single source of truth; no hard-coded string duplicated.
- `mergeAllowlist(existing: unknown, toolIds: string[]): { json: object; added: string[] }` — parse existing `.claude/settings.json` (or `{}` if missing/empty), ensure `permissions.allow` is an array, union in the tool ids without duplicates, preserve all other keys and existing entries. Returns the merged object plus which ids were newly added (for the confirmation Notice). Idempotent.

UI in `renderPermissionsTab`:

- Button **"Generate Claude Code allowlist"**. On click → a consent modal (same pattern as `HookConsentModal`: shows the target path, the tool ids to be added, and a synced-vault warning via `detectSyncedVault`) → on confirm, read `.claude/settings.json` through the existing `FileSystem` port, call `mergeAllowlist`, write back, and show a Notice listing how many entries were added.
- Writes go through the plugin's `FileSystem` abstraction (the one already passed to `CombinedSettingsTab`), not raw `fs`.

**Explicitly out of scope:** the proposal's Step 2 manifest `permissions.suggested` field. Claude Code does not read suggested permissions from an MCP server manifest, so it would be dead config. The generator delivers the same intent (working permissions for a vault) through a supported mechanism.

### Part D — Codex auto-register (new requirement)

The auto-register feature (`src/application/mcp/AutoRegister.ts`) writes the MCP server URL into well-known client config files. It currently supports Claude CLI, Claude Desktop, and Cursor — all JSON files keyed under an `mcpServers` object. Codex is missing, and Codex's config is **TOML**, not JSON, so a new code path is required.

**Codex config format** (verified against OpenAI Codex docs, May 2026):

- File: `$CODEX_HOME/config.toml`, defaulting to `~/.codex/config.toml`.
- Streamable HTTP MCP server entry — no experimental opt-in flag required:
  ```toml
  [mcp_servers.specorator-obsidian-mcp]
  url = "http://127.0.0.1:<port>/mcp"
  ```
- `specorator-obsidian-mcp` is a valid TOML **bare key** (TOML bare keys allow `A-Za-z0-9_-`), so the table header needs no quoting.
- No `bearer_token_env_var` / headers: the server is loopback HTTP with no auth, matching the other targets' `{ type: 'http', url }` entries (Codex omits `type`; `url` alone selects streamable HTTP).

**Generalize `AutoRegister` by config format.** Add a `format: 'json' | 'toml'` discriminant to `AutoRegisterTarget`. `register`/`deregister` dispatch on it; the shared concerns — `.bak` backup, sidecar tamper-detection (`detectExternalMutation` / `recordWrittenHash`, keyed by `configPath`, hashing the rendered entry), and `RegisterResult` reporting — stay generic.

- Existing JSON behavior is unchanged; just factored behind the `'json'` branch.
- New `'codex'` target: `{ id: 'codex', name: 'Codex CLI', configPath: join(process.env.CODEX_HOME ?? join(home, '.codex'), 'config.toml'), format: 'toml' }`.

**Format-preserving TOML splice** — new pure module `src/application/mcp/tomlBlock.ts` (no new dependency; never full-parse/rewrite the user's file):

- `upsertTomlBlock(content, header, bodyLines): string` — locate the line `[<header>]` (trimmed exact match). If present, replace from that header through the line before the next top-level table header (a line that, trimmed, starts with `[` — covers `[table]` and `[[array]]`) or EOF. If absent, append the block at EOF with single-blank-line separation. Returns new content; everything outside our block is left byte-for-byte intact (comments, key order, other tables preserved).
- `removeTomlBlock(content, header): string` — inverse; excises our block and collapses the resulting double blank line.
- `readTomlBlockUrl(content, header): string | null` — scan only within our block for `url = "..."` to support the `unchanged` short-circuit and the tamper hash, without parsing the whole document.

These functions are total and side-effect-free; all the boundary edge cases live here and are unit-tested directly.

**Settings + UI:**

- `AutoRegisterSettings` gains `codex: boolean`; `DEFAULT_AUTO_REGISTER` gains `codex: false` (opt-in, like Cursor/Claude Desktop). On settings load, the `autoRegister` object must be **deep-merged** with `DEFAULT_AUTO_REGISTER` so existing users (whose saved object predates the `codex` key) get `codex: false` rather than `undefined`.
- The Codex toggle joins the auto-register client list, which now lives on the **Server** tab (Part A): name "Codex CLI", desc "`~/.codex/config.toml` — opt in if you use Codex CLI."

Note: the catalog already recognizes a `codex` platform for skill installs (`platforms.ts`); this part only closes the **MCP-server registration** gap, independent of catalog asset installs.

## Data flow

```
User clicks "Trusted writes"
  → applyPreset(settings, 'trusted-writes')  [pure]
  → plugin.saveSettings()
  → display() re-render
  → PermissionGate reads new toolModes on next call (Layer B silent for safe writes)

User clicks "Generate Claude Code allowlist"
  → consent modal (path + ids + sync warning)
  → confirm: fs.read('.claude/settings.json') | {}
  → mergeAllowlist(existing, ALLOWLISTED_TOOLS.map(toHarnessToolId))  [pure]
  → fs.write('.claude/settings.json', merged)
  → Notice("Added N tools to Claude Code allowlist")  (Layer A silent on next session)

User enables "Codex CLI" auto-register toggle, server (re)starts
  → AutoRegister.register(url, [...targets, codex])
  → codex target (format='toml'): read ~/.codex/config.toml | ''
  → upsertTomlBlock(content, 'mcp_servers.specorator-obsidian-mcp', ['url = "<url>"'])  [pure]
  → backup .bak, write file, record sidecar hash
  → Codex CLI sees the MCP server on next launch
```

## Error handling

- Allowlist generator: if `.claude/settings.json` contains invalid JSON, abort with a Notice naming the file and do **not** overwrite (never clobber unparseable user config). If `permissions` exists but `allow` is a non-array, abort with a clear Notice rather than coercing.
- Preset application is pure and total — no failure path beyond the existing `saveSettings`.
- Tab switching never throws on missing data; each render function guards its own async loads (catalog already does).
- Codex TOML splice: operates on raw text and never parses the whole document, so malformed TOML elsewhere in the file cannot crash the write. `.bak` is written before every mutation (existing pattern). A missing `~/.codex/` parent directory is handled by the existing `FileSystemPort.writeText` (the Node adapter already does `mkdir(dir, { recursive: true })` before writing), so no extra directory-creation step is needed.

## Testing

- `presets.test.ts`: `trusted-writes` sets every `SAFE_WRITE_TOOLS` entry to `allow`; leaves `vault.delete`/`vault.move`/`cli.reload` at `ask`; leaves `cli.eval`/`cli.execute`/`cli.run` at `deny`; does not mutate input.
- `claudeAllowlist.test.ts`: `toHarnessToolId` mapping (dot→underscore, correct prefix from manifest id); `mergeAllowlist` on missing file, empty file, existing unrelated keys preserved, duplicate ids not re-added, idempotent on second run, invalid-JSON/non-array rejection.
- Settings render: each of `renderServerTab` / `renderPermissionsTab` / `renderAdvancedTab` renders into a stub `containerEl` without throwing; `activeTab` round-trips across `display()` calls.
- `tomlBlock.test.ts`: `upsertTomlBlock` into empty content, into a file with other tables + comments (both preserved), replacing an existing block when the url changed, idempotent on unchanged url, hyphenated bare-key header, block at EOF vs. block followed by another table; `removeTomlBlock` excision + blank-line collapse; `readTomlBlockUrl` reads only within our block (ignores a `url` in a different table).
- `AutoRegister` codex path: `register` writes the TOML block + `.bak` + sidecar hash; `deregister` removes only our block; `unchanged` when url matches; existing JSON targets unaffected by the `format` dispatch.
- Settings load: `autoRegister` deep-merge yields `codex: false` for a saved object lacking the key.

## Out of scope

- Manifest `permissions.suggested` (no client support — see Part C).
- Changing `PermissionGate` logic, the modal component, or the audit log.
- "Test connection" / latency indicator from the proposal's MCP-tab notes (defer; not required to fix the reported pain).
- Any catalog/workflow data-model change.
- Codex **stdio** transport, bearer-token/header auth, and project-scoped `.codex/config.toml` — the loopback HTTP URL written to the global `~/.codex/config.toml` is sufficient; auth is unnecessary for a no-auth loopback server.
- Codex command/agent catalog assets (already deliberately out of scope per `platforms.ts`); Part D is only MCP-server registration.
