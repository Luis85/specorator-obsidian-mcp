---
term: 'audit report'
aliases: ['audit.report', 'vault audit']
category: technical
status: accepted
version: unreleased
related:
  - src/application/mcp/audit.ts
  - src/infrastructure/obsidian/mcp/registerAuditTool.ts
  - docs/adr/ADR-003-server-side-aggregation.md
last_updated: 2026-05-25
---

# Audit report

An audit report is a single structured payload summarising vault health, produced by the `audit.report` MCP tool. It aggregates orphaned notes, dead-end links, unresolved wikilinks, and tag statistics in one server-side call — replacing patterns that previously required hundreds of individual per-note tool calls.

The `checks` parameter scopes which checks run (e.g. `["orphans"]`), reducing latency on large vaults. `audit.export` writes the same payload as a Markdown or JSON file in the vault.

Default mode: `allow` (read-only). See [ADR-003](../adr/ADR-003-server-side-aggregation.md) for the aggregation design rationale.
