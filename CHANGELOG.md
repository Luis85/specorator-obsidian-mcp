# Changelog

## [Unreleased]

## 0.1.0 — 2026-05-24

- Initial release.
- In-process MCP server over loopback HTTP with Host-header gate.
- Fixed configurable port (default 7842).
- Seven tool groups: vault, metadata, links, canvas, bases, cli.read, cli.execute.
- Permission gate with allow/ask/deny modes per tool, session-allow caching, path deny-list, ask-timeout default-deny.
- Obsidian modal adapter for ask flow.
- Server disabled by default; start/stop via command palette.
- Status bar item shows running port.
