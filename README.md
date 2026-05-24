# Specorator Obsidian MCP

In-process Model Context Protocol server for Obsidian. Exposes the vault, metadata cache, link graph, canvas, bases, and Obsidian command palette as a typed agent tool surface over loopback HTTP.

## Status

In active development — not yet functional. The 0.0.1 release is a scaffolding-only commit; the MCP server, tool registrars, and permission gate land in subsequent versions on `develop`.

## How it works

- The plugin runs an HTTP server on `127.0.0.1:<settings.port>` (default `7842`).
- Each tool call goes through a `PermissionGate` resolving the configured mode: `allow`, `ask`, or `deny`.
- Path-based deny-list takes precedence over per-tool modes.
- All writes are direct (no proposal queue).

## Security

- Loopback bind only. The server rejects any request whose `Host` header is not `127.0.0.1` or `localhost` (HTTP 421).
- Configurable port; defaults to `7842`. Choose any unused local port.
- `cli.execute` (Obsidian command palette execution) defaults to `deny`. Opt in by changing the mode in settings.
- The server is **disabled by default**. Start it from the command palette: "Start MCP server".

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

| Tool | Default mode | Description |
| ---- | ------------ | ----------- |
| `vault.read` | `allow` | Read full UTF-8 content of a vault file |
| `vault.write` | `ask` | Write (overwrite or create) a vault file |
| `vault.delete` | `ask` | Delete a vault file |
| `vault.move` | `ask` | Move (rename) a vault file |
| `vault.list` | `allow` | List files and immediate subfolders in a folder |
| `vault.list_recursive` | `allow` | Recursively enumerate all files under a folder |
| `vault.exists` | `allow` | Check whether a file exists |
| `vault.createFolder` | `ask` | Create a folder |
| `vault.search` | `allow` | Case-insensitive substring search over vault contents; ≤100 results with ~120-char excerpts; optionally scoped to a folder |
| `metadata.frontmatter` | `allow` | YAML frontmatter for a single note |
| `metadata.tags` | `allow` | Global tag → count map across the vault |
| `metadata.headings` | `allow` | Heading list for a single note |
| `metadata.linkpath` | `allow` | Resolve a wikilink to its vault path |
| `metadata.search` | `allow` | Find files by tag **or** frontmatter field=value |
| `links.backlinks` | `allow` | Backlinks (files that link to a given note) |
| `links.outgoing` | `allow` | Outgoing link map for a note |
| `links.bfs` | `allow` | BFS traversal of the link graph |
| `canvas.read` | `allow` | Read a JSON Canvas file |
| `canvas.write` | `ask` | Write (overwrite) a JSON Canvas file |
| `canvas.list` | `allow` | List all `.canvas` files in the vault or under a folder |
| `bases.list` | `allow` | Scan a folder recursively for all frontmatter records |
| `bases.filter` | `allow` | Filter records by one or more field/op/value criteria (AND semantics) |
| `cli.read.list` | `allow` | List all Obsidian command palette commands |
| `cli.read.find` | `allow` | Find commands by id/name substring |
| `cli.execute` | `deny` | Execute a command palette command by id; opt in per-prefix via the allowlist setting |

## License

MIT. See [LICENSE](./LICENSE).
