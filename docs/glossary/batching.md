---
term: 'batching'
aliases: ['yieldEveryN', 'pool', 'batch helpers', 'batching helpers']
category: technical
status: accepted
version: '0.1.0'
related:
  - src/application/mcp/batching.ts
  - src/application/mcp/audit.ts
last_updated: 2026-05-26
---

# Batching

Two async-iteration helpers in `src/application/mcp/batching.ts` that prevent UI freezes and vault adapter overload when processing large file sets inside Obsidian's single-threaded renderer.

**`yieldEveryN(items, batchSize, fn)`** — processes items sequentially, calling `fn` per item, and yields to the macrotask queue via `setTimeout(0)` after every `batchSize` items. This lets Obsidian repaint between batches. Recommended batch sizes: 50 for I/O-bound work (file reads), 200 for CPU-bound in-memory work.

**`pool(items, limit, fn)`** — processes items with at most `limit` concurrent async operations. Replaces unbounded `Promise.all(array.map(...))` patterns that would issue hundreds of simultaneous vault reads. Recommended limit: 8 for file I/O.

Both helpers are used throughout `src/application/mcp/audit.ts`, `graph.ts`, and `frontmatterQuery.ts` wherever the tool iterates the full vault.
