---
name: building-moc
description: Builds a Map of Content / index note from tags and link clusters. Use when the user asks to create an index, MOC, table of contents, or to organize a link-sparse vault.
type: skill
version: 0.1.0
bundle: MOC / Index Builder
requires: [metadata_tags, links_backlinks, links_bfs]
dependsOn: []
---

# Building a MOC

1. Read tags via `mcp__specorator-obsidian-mcp__metadata_tags`.
2. For a chosen topic tag, find notes; map clusters with `mcp__specorator-obsidian-mcp__links_bfs` (direction both, depth 2).
3. Write an index note grouping notes by cluster, linking each with `[[...]]`.
4. Read the report folder from the `/setup` config note (`.specorator/catalog-config.md`) if present; else default to vault root.
5. Fallback: if `links_bfs` is unavailable, use `mcp__specorator-obsidian-mcp__links_backlinks` to enumerate linked notes per tag.
