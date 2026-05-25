---
name: fixing-links
description: Repairs broken wikilinks and unresolved references in vault notes. Use when the user asks to fix broken links, repair unresolved references, or clean up dead links.
type: skill
version: 0.1.0
bundle: Vault Maintenance
requires: [links_unresolved, vault_read, note_patch, vault_write]
dependsOn: []
---

# Fixing Links

This skill mutates the vault. Follow the numbered steps exactly; do not skip the dry-run.

1. Enumerate broken links with `mcp__specorator-obsidian-mcp__links_unresolved`.
2. For each broken link, read the source note with `mcp__specorator-obsidian-mcp__vault_read`.
3. **Dry-run preview:** list every intended change (old link → new link or deletion) and ask the user to confirm before writing anything.
4. On confirmation, fix each note. Prefer `mcp__specorator-obsidian-mcp__note_patch` (heading or block anchor) for surgical in-place link edits; fall back to `mcp__specorator-obsidian-mcp__vault_write` only when the note has no stable anchor or the patch would span multiple sections.
5. Re-check: run `mcp__specorator-obsidian-mcp__links_unresolved` again; report remaining broken links if any.

See `catalog/skills/fixing-links/references/patterns.md` for common link-repair patterns.
