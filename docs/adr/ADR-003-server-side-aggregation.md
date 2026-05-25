---
id: ADR-003
title: Server-side aggregation for audit and graph tools
status: accepted
date: 2026-05-25
references:
  - src/application/mcp/audit.ts
  - src/application/mcp/graph.ts
  - src/infrastructure/obsidian/mcp/registerAuditTool.ts
  - src/infrastructure/obsidian/mcp/registerGraphTools.ts
  - src/domain/settings/PluginSettings.ts
---

# ADR-003 — Server-side aggregation for audit and graph tools

## Context

During a live agent audit of a 2000-note vault, the initial approach exposed per-note tools (`vault.read`, `links.backlinks`, `metadata.frontmatter`, etc.) and expected the agent to call them iteratively to build a health picture. The agent issued more than 2000 MCP calls — one per note — before timing out. The root problem is that iterating over a vault-sized collection via individual tool calls is inherently O(n) in round trips, which compounds latency and exhausts agent context windows on large vaults.

The MCP design literature (Block, MindStudio, Speakeasy) converges on the same guidance: **prefer aggregate over enumerate**. An aggregate tool answers the agent's actual question ("which notes are orphans?") in one call; an enumerate pattern forces the agent to ask the same sub-question n times and synthesise the answer itself.

Reference: `D:/TestVault/specs/Specorator MCP — Audit & Tooling Spec.md`.

## Decision

Introduce a family of aggregate tools that compute vault-wide or graph-wide summaries server-side and return one structured payload:

- `audit.report` — orphans, dead-end links, unresolved links, tag stats. Accepts `checks: string[]` to scope which checks run.
- `audit.export` — same computation, but writes the result as a Markdown/JSON file in the vault.
- `graph.stats` — node count, edge count, density, hub identification.
- `graph.orphans` — notes with no incoming or outgoing links.
- `graph.deadends` — notes that link out but are never linked back to and have no further outgoing links.
- `frontmatter.query` — vault-wide frontmatter aggregation (group-by, filter, count).

Each tool follows a two-layer implementation pattern:

1. **Pure application function** in `src/application/mcp/<name>.ts` — takes port interfaces, returns a plain serialisable object. Unit-testable without MCP wiring.
2. **Thin MCP registrar** in `src/infrastructure/obsidian/mcp/register<Name>Tool(s).ts` — wires ports from the deps object, calls the application function, wraps the result in `okStructured()`.

All aggregate tools default to `allow` mode (read-only, bounded output) except `audit.export` which writes to the vault and defaults to `ask`.

## Rationale

- **O(1) agent calls vs O(n).** A single aggregate call replaces a loop. On a 5000-note vault, `audit.report` runs in ~3–5 seconds but replaces thousands of round trips that would take minutes.
- **Bounded output.** The agent receives a summary (counts, paths, scores) — not full note content. This limits context window consumption and prevents accidental bulk disclosure.
- **Scoping via `checks[]`.** Callers who need only one check (e.g. `["orphans"]`) skip the remaining checks, reducing latency proportionally.
- **Testability.** The pure application layer is unit-tested without Obsidian. The registrar is tested only for wiring (correct tool name, correct output shape).
- **Consistency with permission model.** Read-only aggregate tools default to `allow` — the user does not need to confirm every audit call. `audit.export` writes to the vault so it defaults to `ask`.

## Consequences

- **Larger single-call payload.** A full `audit.report` on a large vault returns a sizeable JSON object. Mitigated by the `checks[]` filter param and by the fact that the payload replaces thousands of small calls.
- **Server-side latency on first run.** The Obsidian metadata cache must be warm for link-graph operations. Cold starts on very large vaults may take 3–5 seconds.
- **Aggregate tools are not a substitute for targeted reads.** They answer "what is the structural health of this vault?" — not "what does this specific note say?". Per-note tools (`vault.read`, `metadata.frontmatter`) remain available for targeted access.
- **New test surface.** The pure application functions require their own unit test files. Registration tests assert exact tool name registration through `DEFAULT_TOOL_MODES`.

## Alternatives considered

- **Expose only per-note tools.** Rejected: proven to produce O(n) agent call patterns on real vaults (see Context).
- **Streaming / pagination.** Considered. Would reduce payload size but adds protocol complexity and is not supported by the current `StreamableHTTPServerTransport` setup in a simple way. Revisit if payloads grow problematic.
- **Background indexing with cache invalidation.** Considered for `graph.stats`. Deferred: the Obsidian metadata cache is already incrementally maintained; recomputing on demand is fast enough for the current vault sizes targeted.
