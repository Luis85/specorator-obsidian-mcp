---
name: normalizing-frontmatter
description: Normalizes YAML frontmatter fields across vault notes to a consistent schema. Use when the user asks to standardize frontmatter, fix metadata inconsistencies, or align note schemas.
type: skill
version: 0.1.0
bundle: Vault Maintenance
requires: [metadata_frontmatter, vault_write, vault_list]
dependsOn: []
---

# Normalizing Frontmatter

This skill mutates the vault. Follow the numbered steps exactly; do not skip the dry-run.

1. List target notes with `mcp__specorator-obsidian-mcp__vault_list`.
2. For each note, read current frontmatter with `mcp__specorator-obsidian-mcp__metadata_frontmatter`.
3. **Dry-run preview:** enumerate every field change (old value → new value) across all notes; ask the user to confirm the schema and the change set before writing anything.
4. On confirmation, apply each change with `mcp__specorator-obsidian-mcp__vault_write` (write the full updated note content).
5. Re-check: re-read frontmatter for 3–5 sample notes and confirm the expected fields are present.

See `catalog/skills/normalizing-frontmatter/references/schema.md` for the canonical field list and allowed value sets.
