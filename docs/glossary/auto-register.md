---
term: 'auto-register'
aliases: ['AutoRegister', 'autoRegister']
category: technical
status: accepted
version: '0.1.0'
related:
  - src/application/mcp/AutoRegister.ts
  - src/plugin/main.ts
last_updated: 2026-05-25
---

# Auto-register

The `AutoRegister` class (`src/application/mcp/AutoRegister.ts`) automatically injects the plugin's MCP server URL into external MCP client config files when the server starts, and removes it when the server stops.

**Config files touched** (one per target, controlled by `autoRegister` settings):

| Target          | Config file path                                                             |
| --------------- | ---------------------------------------------------------------------------- |
| `claudeCli`     | `~/.claude.json`                                                            |
| `cursor`        | `~/.cursor/mcp.json`                                                        |
| `claudeDesktop` | Platform-dependent (`~/Library/Application Support/Claude/...` on macOS)   |

**When it runs:** `register()` is called at the end of `startServer()` in `main.ts`; `deregister()` is called at the start of `stopServer()`. The `AutoRegister` instance is constructed once on plugin load and reused for both calls.

**Backup rotation:** before mutating any config file, the existing content is written to `<configPath>.bak` (single rotation — overwrites the previous backup).

**Safe failure:** if a config file contains unparseable JSON, the target is skipped with `status: 'skipped'` and no write is attempted. Write errors surface as `status: 'failed'` with a reason string. Neither case blocks server start/stop.
