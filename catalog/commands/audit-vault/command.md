---
name: audit-vault
description: Slash command that runs a full vault health audit and writes a report note. Invoke only via /audit-vault; for natural-language audit requests the auditing-vault skill fires instead.
type: command
version: 0.1.0
bundle: Vault Audit
requires: [links_unresolved, graph_orphans, attachments_orphans, audit_report, vault_write]
dependsOn: []
---

# /audit-vault

Read config from `.specorator/catalog-config.md` (fields `reportFolder`, `auditDefaults`).
Default `reportFolder` is vault root; default `auditDefaults.includeOrphans` is true.

1. Run `mcp__specorator-obsidian-mcp__links_unresolved` — collect broken links.
2. Run `mcp__specorator-obsidian-mcp__graph_orphans` — collect orphaned notes.
3. Run `mcp__specorator-obsidian-mcp__attachments_orphans` — collect unused attachments.
4. Run `mcp__specorator-obsidian-mcp__audit_report` if available; else aggregate the above manually.
5. Write a report note to `{reportFolder}/vault-audit-{YYYY-MM-DD}.md` listing findings by category.
