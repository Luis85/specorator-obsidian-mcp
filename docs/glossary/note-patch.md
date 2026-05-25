---
term: 'note patch'
aliases: ['note.patch', 'anchor-based edit', 'surgical edit']
category: technical
status: accepted
version: unreleased
related:
  - src/infrastructure/obsidian/mcp/registerPatchTools.ts
  - docs/adr/ADR-004-write-safety-hash-guard.md
last_updated: 2026-05-25
---

# Note patch

A note patch is a surgical, anchor-targeted edit applied to a vault note by the `note.patch` MCP tool. Rather than replacing the entire file, the caller specifies an anchor (a heading text, block ID, frontmatter key, or end-of-file) and an operation (`append`, `prepend`, or `replace`). The tool locates the anchor and applies the operation, returning `{ path, bytesChanged, newHash }`.

`note.patch` never silently no-ops: if the anchor is not found, it returns an error. This is preferred over a full read–modify–`vault.write` cycle for structured modifications because it avoids the two-call `vault.hash` + `vault.write` pattern and limits the edit surface to the targeted section.

Default mode: `ask`. See [ADR-004](../adr/ADR-004-write-safety-hash-guard.md) for the write-safety context.
