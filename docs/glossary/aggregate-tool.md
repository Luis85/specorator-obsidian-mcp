---
term: 'aggregate tool'
aliases: ['aggregate', 'server-side aggregation', 'bulk tool']
category: technical
status: accepted
version: unreleased
related:
  - docs/glossary/audit-report.md
  - docs/adr/ADR-003-server-side-aggregation.md
  - src/application/mcp/audit.ts
  - src/application/mcp/graph.ts
last_updated: 2026-05-25
---

# Aggregate tool

An aggregate tool is an MCP tool that computes a vault-wide or graph-wide summary server-side and returns one structured payload, rather than exposing raw per-note data that the agent would have to enumerate.

Examples: `audit.report`, `graph.stats`, `graph.orphans`, `graph.deadends`, `frontmatter.query`. All default to `allow` mode because they are read-only and return bounded output (counts, paths, scores — not full note content).

The design principle is **aggregate over enumerate**: an agent asking "which notes are orphans?" should receive a list in one call, not iterate over the vault note by note. See [ADR-003](../adr/ADR-003-server-side-aggregation.md) for the rationale, implementation pattern, and performance tradeoffs.
