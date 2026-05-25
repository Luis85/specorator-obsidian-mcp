---
name: moc-builder
description: Slash command that builds a MOC for an explicit tag or folder argument. Invoke only via /moc-builder; for natural-language MOC requests the building-moc skill fires instead.
type: command
version: 0.1.0
bundle: MOC / Index Builder
requires: [metadata_tags, links_bfs, vault_write]
dependsOn: []
---

# /moc-builder

Read the config note `.specorator/catalog-config.md` for the MOC location (`mocFolder`).
Default `mocFolder` is vault root.

1. Parse the argument: `/moc-builder #tag` or `/moc-builder folder/`.
2. Enumerate notes matching the tag via `mcp__specorator-obsidian-mcp__metadata_tags`.
3. Map clusters with `mcp__specorator-obsidian-mcp__links_bfs` (direction both, depth per `auditDefaults.maxDepth`).
4. Write the index note to `{mocFolder}/{tag}-moc.md` with `[[wikilinks]]` grouped by cluster.
