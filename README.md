# Specorator Obsidian MCP

Specorator Obsidian MCP lets AI tools — Claude, Cursor, Claude Desktop — read and write your Obsidian vault over a secure local connection. Notes, links, canvas, bases, and Obsidian commands are exposed as Model Context Protocol (MCP) tools.

## Status

**0.1.0 — first public release.** Active development; feedback welcome.

<!-- TODO: add settings tab screenshot, modal screenshot -->

## Install

### Via BRAT (recommended now)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) community plugin and enable it.
2. Open the command palette → **BRAT: Add a beta plugin for testing**.
3. Paste `Luis85/specorator-obsidian-mcp` and click **Add Plugin**.
4. Enable **Specorator Obsidian MCP** in **Settings → Community plugins**.

### Via Obsidian Community Plugins

Coming soon — pending marketplace review.

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

## Tool groups

| Tool                   | Default mode | Description                                                                                                                |
| ---------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `vault.read`           | `allow`      | Read full UTF-8 content of a vault file                                                                                    |
| `vault.write`          | `ask`        | Write (overwrite or create) a vault file                                                                                   |
| `vault.delete`         | `ask`        | Delete a vault file                                                                                                        |
| `vault.move`           | `ask`        | Move (rename) a vault file                                                                                                 |
| `vault.list`           | `allow`      | List files and immediate subfolders in a folder                                                                            |
| `vault.list_recursive` | `allow`      | Recursively enumerate all files under a folder                                                                             |
| `vault.exists`         | `allow`      | Check whether a file exists                                                                                                |
| `vault.createFolder`   | `ask`        | Create a folder                                                                                                            |
| `vault.search`         | `allow`      | Case-insensitive substring search over vault contents; ≤100 results with ~120-char excerpts; optionally scoped to a folder |
| `metadata.frontmatter` | `allow`      | YAML frontmatter for a single note                                                                                         |
| `metadata.tags`        | `allow`      | Global tag → count map across the vault                                                                                    |
| `metadata.headings`    | `allow`      | Heading list for a single note                                                                                             |
| `metadata.linkpath`    | `allow`      | Resolve a wikilink to its vault path                                                                                       |
| `metadata.search`      | `allow`      | Find files by tag **or** frontmatter field=value                                                                           |
| `links.backlinks`      | `allow`      | Backlinks (files that link to a given note)                                                                                |
| `links.outgoing`       | `allow`      | Outgoing link map for a note                                                                                               |
| `links.bfs`            | `allow`      | BFS traversal of the link graph                                                                                            |
| `canvas.read`          | `allow`      | Read a JSON Canvas file                                                                                                    |
| `canvas.write`         | `ask`        | Write (overwrite) a JSON Canvas file                                                                                       |
| `canvas.list`          | `allow`      | List all `.canvas` files in the vault or under a folder                                                                    |
| `bases.list`           | `allow`      | Scan a folder recursively for all frontmatter records                                                                      |
| `bases.filter`         | `allow`      | Filter records by one or more field/op/value criteria (AND semantics)                                                      |
| `cli.read.list`        | `allow`      | List all Obsidian command palette commands                                                                                 |
| `cli.read.find`        | `allow`      | Find commands by id/name substring                                                                                         |
| `cli.execute`          | `deny`       | Execute a command palette command by id; opt in per-prefix via the allowlist setting                                       |

## Troubleshooting

**`EADDRINUSE`:** Another process is using port 7842. Change the port in **Settings → Port** and restart the server.

**`421 Misdirected Request`:** The client is sending a non-loopback `Host` header. Add the server URL via the auto-register feature, or set the `Host` header to `127.0.0.1:7842` in your client's MCP config.

**Auto-register permission denied on Windows:** Check that `~/.claude.json` is writable. The plugin shows a Notice in Obsidian if it cannot write the config file. You can also add the entry manually — see the JSON snippet in Client integration above.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT. See [LICENSE](./LICENSE).
