---
term: 'tool-call audit entry'
aliases: ['ToolCallAuditEntry', 'tool-call audit', 'tool call audit']
category: technical
status: accepted
version: '0.1.0'
related:
  - src/application/catalog/auditlog.ts
  - docs/glossary/audit-log.md
  - docs/glossary/permission-gate.md
last_updated: 2026-05-26
---

# Tool-call audit entry

A JSONL record appended to `.specorator/audit-log.jsonl` for every MCP tool-call decision made by `PermissionGate`. The `ToolCallAuditEntry` interface (`src/application/catalog/auditlog.ts`) carries:

| Field      | Contents                                                                   |
| ---------- | -------------------------------------------------------------------------- |
| `kind`     | `"tool-call"` (discriminates from install entries)                         |
| `tool`     | Full tool name (e.g. `vault.write`)                                        |
| `decision` | `"allow"` or `"deny"`                                                      |
| `reason`   | Human-readable explanation (mode, session-allow, timeout)                  |
| `params`   | Redacted call params — large/sensitive fields replaced with `"<redacted>"` |
| `ts`       | ISO-8601 timestamp                                                         |

Sensitive fields (`content`, `body`, `data`, `code`, `script`) are dropped by `redactParams` before the entry is written, preventing vault content or executable code from appearing in the log verbatim.

Used for post-incident review and compliance auditing. Not intended for real-time monitoring — use Obsidian's developer console for that.
