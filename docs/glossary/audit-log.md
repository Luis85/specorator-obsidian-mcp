---
term: 'audit log'
aliases: ['audit-log.jsonl', '.specorator/audit-log.jsonl', 'appendAudit']
category: technical
status: accepted
version: '0.1.0'
related:
  - src/application/catalog/auditlog.ts
  - docs/glossary/tool-call-audit.md
  - docs/adr/ADR-005-catalog-install-lifecycle.md
last_updated: 2026-05-26
---

# Audit log

An append-only JSONL file written to `.specorator/audit-log.jsonl` that records every install lifecycle event and every MCP tool-call decision. Each line is a JSON object with a `kind` discriminator (`"install"` or `"tool-call"`), a `ts` timestamp, and event-specific fields.

The file is written exclusively via the privileged `FileSystem` port (`src/application/catalog/auditlog.ts`). The `.specorator/` directory is in `pathDenyList`, so MCP tool calls cannot reach it — the log cannot be poisoned through the very surface it audits.

**Rotation:** when the file exceeds 5 MB, `rotateIfNeeded` drops the oldest 20 % of lines and appends a synthetic `rotation` entry. No external log-rotation daemon is required.

Distinct from the human-readable _audit report_ produced by `vault.audit` (see [audit-report](./audit-report.md)) — that is a query result, not the persistent event record.
