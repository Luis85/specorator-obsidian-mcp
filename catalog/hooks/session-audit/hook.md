---
name: session-audit
description: Runs the vault audit on session start and appends the summary to today's daily note. Use to keep a running audit log per session.
type: hook
version: 0.1.0
bundle: Vault Audit
requires: []
dependsOn: []
---

```json
{
  "id": "session-audit",
  "event": "SessionStart",
  "entry": {
    "matcher": "*",
    "command": "claude --print '/audit-vault' >> \"$VAULT/$(date +%Y-%m-%d).md\""
  }
}
```
