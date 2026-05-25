# Specorator Obsidian MCP

Specorator Obsidian MCP lets AI tools — Claude, Cursor, Claude Desktop — read and write your Obsidian vault over a secure local connection. Notes, links, canvas, bases, and Obsidian commands are exposed as Model Context Protocol (MCP) tools.

## Status

**Active development.** Current tool count: 49 (was 21 at 0.1.0 launch). See [CHANGELOG](./CHANGELOG.md) for detail.

<!-- TODO: add settings tab screenshot, modal screenshot -->

## Install

### Via BRAT (recommended now)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) community plugin and enable it.
2. Open the command palette → **BRAT: Add a beta plugin for testing**.
3. Paste `Luis85/specorator-obsidian-mcp` and click **Add Plugin**.
4. Enable **Specorator Obsidian MCP** in **Settings → Community plugins**.

### Via Obsidian Community Plugins

Coming soon — pending marketplace review.

## What's new since 0.1.0

- **One-shot vault health audit** (`audit.report`) — returns orphans, dead-end links, unresolved links, and tag stats in a single call. Server-side aggregation means the agent never has to enumerate notes individually. See [ADR-003](./docs/adr/ADR-003-server-side-aggregation.md).
- **Surgical edits** (`note.patch`, `frontmatter.set`, `frontmatter.query`) — target a specific heading, block, frontmatter key, or end-of-file without rewriting the entire note. `frontmatter.query` aggregates across the full vault.
- **Graph aggregates** (`graph.stats`, `graph.orphans`, `graph.deadends`) — structural link-graph metrics in one call; no per-note iteration required.
- **Bulk + safety** (`tags.rename`, `vault.hash`, `vault.walk`) — rename a tag vault-wide with a dry-run preview; `vault.write` now requires `mode: 'overwrite'` + `expectedHash` to overwrite existing files, preventing accidental data loss. See [ADR-004](./docs/adr/ADR-004-write-safety-hash-guard.md).
- **Obsidian CLI integration** (`cli.screenshot`, `cli.run`, `cli.daily_note`, `cli.workspace_load`, `cli.template_insert`, `cli.open_file`, `cli.reload`) — curated high-value CLI subcommands exposed as individual typed tools, plus `cli.run` for arbitrary CLI dispatch.
- **Auto-discovery** to Claude CLI (default on), Claude Desktop, and Cursor — plugin writes and removes the server URL automatically; no manual config editing needed.
- **49 tools total** (up from 21 at first release) across 10 namespaces. See the capability matrix below.

## Quick start

1. Enable the plugin in **Settings → Community plugins**.
2. Open the command palette and run **Start MCP server**.
3. The status bar shows `MCP: 127.0.0.1:7842` — the server is running.
4. The plugin auto-registers the URL with Claude CLI by default (`~/.claude.json`). Verify with `claude mcp list`.
5. Open Claude Code and ask it to list your vault files.

## How it works

- The plugin runs an HTTP server on `127.0.0.1:<settings.port>` (default `7842`).
- Each tool call goes through a `PermissionGate` resolving the configured mode: `allow`, `ask`, or `deny`.
- Path-based deny-list takes precedence over per-tool modes.
- All writes are direct (no proposal queue).

## Security & trust

- Loopback bind only. The server rejects any request whose `Host` header is not `127.0.0.1` or `localhost` (HTTP 421).
- Origin header gate rejects cross-origin browser requests.
- Configurable port; defaults to `7842`. Choose any unused local port.
- `cli.execute` (Obsidian command palette execution) defaults to `deny`. Opt in per-prefix in settings.
- The server is **disabled by default**. Start it from the command palette: "Start MCP server".
- When you start the server, every tool the LLM can call shows the configured mode in Settings. Defaults err on the side of asking before any write.

See [SECURITY.md](./SECURITY.md) for the full trust model and vulnerability reporting.

## Client integration

When the MCP server starts, the plugin can automatically write the server URL into well-known client config files so MCP clients discover it without manual configuration. When the server stops, the entry is removed.

The plugin writes only its own key (`specorator-obsidian-mcp`) and never touches other entries in the same file.

| Client         | Config file                  | Default     |
| -------------- | ---------------------------- | ----------- |
| Claude CLI     | `~/.claude.json`             | **enabled** |
| Cursor         | `~/.cursor/mcp.json`         | disabled    |
| Claude Desktop | `claude_desktop_config.json` | disabled    |

The entry shape written to every target:

```json
{
  "mcpServers": {
    "specorator-obsidian-mcp": {
      "type": "http",
      "url": "http://127.0.0.1:7842/mcp"
    }
  }
}
```

Toggle each client in **Settings → Auto-register MCP URL with clients**. Changes take effect on next server start.

**Manual integration (other clients):** copy the URL shown in the Obsidian status bar and add it to your client's MCP config using the key `specorator-obsidian-mcp`.

## Settings

| Setting                      | Type                                     | Default                              |
| ---------------------------- | ---------------------------------------- | ------------------------------------ |
| `port`                       | number                                   | `7842`                               |
| `defaultMode`                | `'allow' \| 'ask' \| 'deny'`             | `'ask'`                              |
| `toolModes`                  | per-tool overrides                       | sensible defaults (see settings tab) |
| `pathDenyList`               | glob patterns                            | `[]`                                 |
| `askTimeoutMs`               | number (ms)                              | `30000`                              |
| `logLevel`                   | `'debug' \| 'info' \| 'warn' \| 'error'` | `'warn'`                             |
| `autoRegister.claudeCli`     | boolean                                  | `true`                               |
| `autoRegister.cursor`        | boolean                                  | `false`                              |
| `autoRegister.claudeDesktop` | boolean                                  | `false`                              |
| `cliExecuteAllowedPrefixes`  | command-id prefix list (one per line)    | `[]`                                 |
| `cliRunAllowedPrefixes`      | command-id prefix list (one per line)    | `[]`                                 |
| `obsidianBinPath`            | string (path)                            | `''` (auto-detect)                   |
| `developerMode`              | boolean                                  | `false`                              |

## Tool groups

49 tools across 10 namespaces. Default modes: `allow` = runs immediately; `ask` = modal confirmation; `deny` = disabled until explicitly opted in.

### vault — Core file operations

| Tool                   | Default mode | Description                                                                                                                |
| ---------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `vault.read`           | `allow`      | Read full UTF-8 content of a vault file                                                                                    |
| `vault.list`           | `allow`      | List files and immediate subfolders in a folder                                                                            |
| `vault.list_recursive` | `allow`      | Recursively enumerate all files under a folder                                                                             |
| `vault.exists`         | `allow`      | Check whether a file exists                                                                                                |
| `vault.search`         | `allow`      | Case-insensitive substring search over vault contents; ≤100 results with ~120-char excerpts; optionally scoped to a folder |
| `vault.walk`           | `allow`      | Walk the vault tree and return paths with optional glob filter and metadata                                                |
| `vault.hash`           | `allow`      | Return the SHA-256 hex hash and byte size of a vault file; use before `vault.write` with `mode:'overwrite'`                |
| `vault.write`          | `ask`        | Write a vault file; `mode:'create'` (default) refuses to overwrite; `mode:'overwrite'` requires `expectedHash`             |
| `vault.delete`         | `ask`        | Delete a vault file                                                                                                        |
| `vault.move`           | `ask`        | Move (rename) a vault file                                                                                                 |
| `vault.createFolder`   | `ask`        | Create a folder                                                                                                            |

### metadata — Frontmatter, tags, headings

| Tool                   | Default mode | Description                                  |
| ---------------------- | ------------ | -------------------------------------------- |
| `metadata.frontmatter` | `allow`      | YAML frontmatter for a single note           |
| `metadata.tags`        | `allow`      | Global tag → count map across the vault      |
| `metadata.headings`    | `allow`      | Heading list for a single note               |
| `metadata.linkpath`    | `allow`      | Resolve a wikilink to its vault path         |
| `metadata.search`      | `allow`      | Find files by tag or frontmatter field=value |

### frontmatter — Vault-wide frontmatter operations

| Tool                | Default mode | Description                                                                         |
| ------------------- | ------------ | ----------------------------------------------------------------------------------- |
| `frontmatter.set`   | `ask`        | Set or update a single frontmatter key (dot-path) across one note                   |
| `frontmatter.query` | `allow`      | Aggregate frontmatter values across the vault — group-by, filter, or count by field |

### note — Surgical note edits

| Tool         | Default mode | Description                                                                                                                                  |
| ------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `note.patch` | `ask`        | Surgical heading/block/frontmatter/eof edit; anchors by heading text, block ID, frontmatter key, or end-of-file; ops: append/prepend/replace |

### links — Link graph traversal

| Tool               | Default mode | Description                                 |
| ------------------ | ------------ | ------------------------------------------- |
| `links.backlinks`  | `allow`      | Backlinks (files that link to a given note) |
| `links.outgoing`   | `allow`      | Outgoing link map for a note                |
| `links.bfs`        | `allow`      | BFS traversal of the link graph             |
| `links.unresolved` | `allow`      | List all unresolved wikilinks in the vault  |

### graph — Structural link-graph aggregates

| Tool             | Default mode | Description                                                               |
| ---------------- | ------------ | ------------------------------------------------------------------------- |
| `graph.stats`    | `allow`      | Vault-wide link graph statistics (node count, edge count, density)        |
| `graph.orphans`  | `allow`      | Notes with no incoming or outgoing links                                  |
| `graph.deadends` | `allow`      | Notes with outgoing links that resolve but have no further outgoing links |

### tags — Tag management

| Tool          | Default mode | Description                                                                                      |
| ------------- | ------------ | ------------------------------------------------------------------------------------------------ |
| `tags.rename` | `ask`        | Bulk rename a tag across all vault notes; default `dryRun:true` returns the plan without writing |

### attachments — Non-note file management

| Tool                  | Default mode | Description                                                                      |
| --------------------- | ------------ | -------------------------------------------------------------------------------- |
| `attachments.orphans` | `allow`      | Find unreferenced media files (non-.md/.canvas/.base) by scanning all text files |

### audit — Vault health

| Tool           | Default mode | Description                                                                                                 |
| -------------- | ------------ | ----------------------------------------------------------------------------------------------------------- |
| `audit.report` | `allow`      | One-shot vault health audit: orphans, dead-end links, unresolved links, tag stats; use `checks:[]` to scope |
| `audit.export` | `ask`        | Run a vault audit and write a Markdown report (and optional JSON baseline) to the vault                     |

### canvas — JSON Canvas files

| Tool           | Default mode | Description                                             |
| -------------- | ------------ | ------------------------------------------------------- |
| `canvas.read`  | `allow`      | Read a JSON Canvas file                                 |
| `canvas.list`  | `allow`      | List all `.canvas` files in the vault or under a folder |
| `canvas.write` | `ask`        | Write (overwrite) a JSON Canvas file                    |

### bases — Obsidian Bases core plugin

Requires the **Bases** core plugin to be enabled in Obsidian settings.

| Tool           | Default mode | Description                                                                  |
| -------------- | ------------ | ---------------------------------------------------------------------------- |
| `bases.list`   | `allow`      | List all `.base` files in the vault via `obsidian base:list`                 |
| `bases.views`  | `allow`      | List views defined in a `.base` file via `obsidian base:views`               |
| `bases.query`  | `allow`      | Execute a view in a `.base` file; format=json/md/paths/csv                   |
| `bases.read`   | `allow`      | Read the raw YAML content of a `.base` file directly from the vault (no CLI) |
| `bases.create` | `ask`        | Create a new note through a base view via `obsidian base:create`             |

### cli — Obsidian CLI integration

`cli.execute` and `cli.eval` are disabled by default; opt in via `cliExecuteAllowedPrefixes` / `developerMode`. `cli.run` requires `cliRunAllowedPrefixes`.

| Tool                  | Default mode | Description                                                                                                  |
| --------------------- | ------------ | ------------------------------------------------------------------------------------------------------------ |
| `cli.read.list`       | `allow`      | List all Obsidian command palette commands                                                                   |
| `cli.read.find`       | `allow`      | Find commands by id/name substring                                                                           |
| `cli.execute`         | `deny`       | Execute a command palette command by id; opt in per-prefix via `cliExecuteAllowedPrefixes`                   |
| `cli.run`             | `deny`       | Spawn the `obsidian` CLI binary with arbitrary command and arguments; opt in via `cliRunAllowedPrefixes`     |
| `cli.screenshot`      | `ask`        | Capture a screenshot of the Obsidian window via the CLI                                                      |
| `cli.daily_note`      | `ask`        | Open or create today's daily note via the CLI                                                                |
| `cli.workspace_load`  | `ask`        | Load a named workspace layout via the CLI                                                                    |
| `cli.template_insert` | `ask`        | Insert a template into the active note via the CLI                                                           |
| `cli.open_file`       | `ask`        | Open a vault file in Obsidian via the CLI                                                                    |
| `cli.reload`          | `ask`        | Reload Obsidian via the CLI (use with care)                                                                  |
| `cli.eval`            | `deny`       | Execute arbitrary JavaScript in Obsidian's renderer context; only registered when `developerMode` is enabled |

## Troubleshooting

**`EADDRINUSE`:** Another process is using port 7842. Change the port in **Settings → Port** and restart the server.

**`421 Misdirected Request`:** The client is sending a non-loopback `Host` header. Add the server URL via the auto-register feature, or set the `Host` header to `127.0.0.1:7842` in your client's MCP config.

**Auto-register permission denied on Windows:** Check that `~/.claude.json` is writable. The plugin shows a Notice in Obsidian if it cannot write the config file. You can also add the entry manually — see the JSON snippet in Client integration above.

**`cli.screenshot` returns "obsidian: command not found":** The Obsidian CLI must be enabled (**Settings → General → Enable CLI** inside Obsidian). If the CLI is enabled but the binary is not on `PATH`, set `obsidianBinPath` in plugin settings to the full path of the `obsidian` executable (or set `OBSIDIAN_BIN=/path/to/obsidian` before starting Obsidian). Use the auto-detect button in plugin settings to let the plugin find the binary.

**`audit.report` is slow on large vaults:** On vaults with more than ~5000 notes, the first `audit.report` call takes 3–5 seconds as it scans every file. Pass a scoped `checks` array (e.g. `{ "checks": ["orphans"] }`) to limit which checks run and reduce latency on subsequent calls.

**`vault.write` refuses to overwrite:** The default `mode: 'create'` intentionally returns a `file_exists` error rather than silently replacing content. To overwrite: first call `vault.hash` to obtain the current file hash, then call `vault.write` with `mode: 'overwrite'` and `expectedHash` set to that hash. If another process modified the file between the two calls, `vault.write` returns `hash_mismatch` — read the file again and retry.

**"Output validation error: no structured content":** This was a schema-drift bug fixed in the current `develop` build. Update the plugin via BRAT or pull the latest commit.

**Running integration tests against the real Obsidian CLI:** The CLI adapter integration tests (`NodeObsidianCliAdapter.integration.test.ts`) are skipped by default so CI stays green without Obsidian installed. To run them locally, set the `OBSIDIAN_BIN` environment variable to the path of your Obsidian CLI binary:

```sh
OBSIDIAN_BIN=/path/to/obsidian npm test
# Windows (PowerShell):
$env:OBSIDIAN_BIN = "C:\path\to\obsidian.exe"; npm test
```

The tests invoke `obsidian version`, `obsidian help`, and an unknown command to verify the adapter wires through correctly to the real binary.

## Compared with other Obsidian MCP servers

Two other projects expose Obsidian over MCP. The table below lists what each one provides and where Specorator Obsidian MCP differs.

### obsidian-cli-mcp-server (cks850711)

A stdio MCP server that wraps the Obsidian CLI binary. It exposes **2 tools**: `obsidian_exec` (pass any CLI sub-command as a free-form string) and `obsidian_blocked_commands` (list the configured blocklist). Configuration is a static `constants.ts` file; there are no runtime settings, no per-tool modes, and no vault-side integration — it runs as a standalone Node process outside Obsidian.

### obsidian-local-rest-api (coddingtonbear)

An Obsidian plugin that serves both a REST API and an MCP endpoint. It exposes **~19 tools** covering vault CRUD (`vault_list`, `vault_read`, `vault_write`, `vault_append`, `vault_patch`, `vault_delete`, `vault_move`, `vault_get_document_map`), active-file operations, periodic-note resolution, search (`search_query`, `search_simple`), tag listing, and command palette access (`command_list`, `command_execute`, `open_file`). No screenshot, audit, graph, or canvas tools are present.

### Feature comparison

| Feature | Specorator Obsidian MCP | obsidian-cli-mcp-server | obsidian-local-rest-api |
|---|---|---|---|
| **Tool count** | **49** across 10 namespaces | 2 (one catch-all) | ~19 |
| **Per-tool permission gate** (allow / ask / deny) | Yes — configurable per tool with modal confirmation | No | No |
| **Path deny-list** | Yes — glob patterns; takes precedence over tool modes | No | No |
| **Auto-register to `~/.claude.json`** | Yes — atomic write on server start, removes on stop | No (stdio; no HTTP URL) | No |
| **Atomic config writes** | Yes — read-modify-write with lock on `~/.claude.json` | No | No |
| **One-shot vault audit** (`audit.report`) | Yes — orphans, dead-ends, unresolved links, tag stats in one call | No | No |
| **Surgical note edits** (`note.patch`) | Yes — heading / block / frontmatter / eof anchors | No | Partial (`vault_patch`) |
| **Write safety hash guard** (`vault.hash` + `expectedHash`) | Yes — `vault.write` with `mode:'overwrite'` requires hash | No | No |
| **Server-side aggregation** (audit, graph) | Yes — single call returns vault-wide metrics | No | No |
| **Link graph** (`graph.stats`, `graph.orphans`, `graph.deadends`, BFS) | Yes | No | No |
| **Canvas support** | Yes (`canvas.read`, `canvas.list`, `canvas.write`) | No | No |
| **Bases support** | Yes (`bases.list`, `bases.views`, `bases.query`, `bases.read`, `bases.create`) | No | No |
| **CLI screenshot** | Yes (`cli.screenshot`) | No (raw `obsidian screenshot`) | No |
| **Vault-wide tag rename** (`tags.rename`) | Yes — with dry-run preview | No | No |
| **Frontmatter aggregation** (`frontmatter.query`) | Yes — group-by / filter across the vault | No | No |
| **Transport** | HTTP (loopback, `127.0.0.1` Host gate) | stdio | HTTP (Streamable) |
| **Runs inside Obsidian** | Yes (Obsidian plugin) | No (external Node process) | Yes (Obsidian plugin) |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT. See [LICENSE](./LICENSE).
