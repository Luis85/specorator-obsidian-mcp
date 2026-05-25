---
name: auditing-vault
description: Audits an Obsidian vault for orphans, broken links, and tag issues. Use when the user asks to audit, health-check, or clean up a vault, or mentions orphan notes, broken links, or messy tags.
type: skill
version: 0.1.0
bundle: Vault Audit
requires:
  [audit_report, links_unresolved, vault_walk, links_backlinks, links_outgoing, metadata_tags]
dependsOn: []
---

# Auditing a vault

Produce a vault health report using the Specorator MCP tools.

## Steps

1. **Try the one-shot report first.** If `mcp__specorator-obsidian-mcp__audit_report` is available, call it (it returns orphans, dead-ends, unresolved links, empty notes, large files, and tag dupes in one call) and skip to step 5. **Otherwise**, fall back to the manual steps 2–4 below.
2. Enumerate notes with `mcp__specorator-obsidian-mcp__vault_walk` (glob `**/*.md`); fall back to `mcp__specorator-obsidian-mcp__vault_list` per subfolder on older servers (root listing is blind).
3. For each note, gather links via `mcp__specorator-obsidian-mcp__links_backlinks` and `mcp__specorator-obsidian-mcp__links_outgoing`. Flag orphans (no backlinks) and dead-ends (no outgoing). Find broken wikilinks with `mcp__specorator-obsidian-mcp__links_unresolved`.
4. Gather tags via `mcp__specorator-obsidian-mcp__metadata_tags`; flag case-dupes/near-dupes.
5. Write the report to the configured report folder (default `audits/`) with `mcp__specorator-obsidian-mcp__vault_write`.

> **Working-directory assumption (Decision 6):** this skill only resolves vault
> paths correctly when the agent runs with the **vault as its project/working
> root**. If invoked from another cwd, the MCP tools operate on the wrong tree.
