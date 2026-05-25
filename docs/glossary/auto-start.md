---
term: 'auto-start'
aliases: ['autoStart']
category: technical
status: accepted
version: '0.1.0'
related:
  - src/domain/settings/PluginSettings.ts
  - src/plugin/main.ts
last_updated: 2026-05-26
---

# Auto-start

The `autoStart` boolean in `PluginSettings` (`src/domain/settings/PluginSettings.ts`) controls whether the MCP server starts automatically when Obsidian loads the plugin.

Default is `false` — the user must explicitly start the server via the "Start MCP server" command palette entry. This is deliberate: opening a localhost listener on every Obsidian startup without user intent is treated as an unacceptable ambient risk (see ADR-001).

When `autoStart` is `true`, `main.ts` calls `adapter.start()` inside `onload()` rather than waiting for the command. The setting takes effect on the next Obsidian restart; toggling it while the plugin is running does not start or stop the server mid-session.

Setting `autoStart: true` is recommended for power users who always want the MCP surface available, and required for headless or CI vault setups where the command palette is not reachable.
