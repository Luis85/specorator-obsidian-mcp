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

## Settings

| Setting        | Type                                     | Default                              |
| -------------- | ---------------------------------------- | ------------------------------------ |
| `port`         | number                                   | `7842`                               |
| `defaultMode`  | `'allow' \| 'ask' \| 'deny'`             | `'ask'`                              |
| `toolModes`    | per-tool overrides                       | sensible defaults (see settings tab) |
| `pathDenyList` | glob patterns                            | `[]`                                 |
| `askTimeoutMs` | number (ms)                              | `30000`                              |
| `logLevel`     | `'debug' \| 'info' \| 'warn' \| 'error'` | `'warn'`                             |

## Tool groups

- `vault.*` — read/write/list/exists/move/delete/createFolder
- `metadata.*` — frontmatter, tags, headings, linkpath
- `links.*` — backlinks, outgoing, BFS traverse
- `canvas.*` — read/write canvas files
- `bases.*` — list/filter Obsidian Bases records
- `cli.read.*` — list/find Obsidian command palette commands
- `cli.execute` — execute a command palette command (default `deny`)

## License

MIT. See [LICENSE](./LICENSE).
