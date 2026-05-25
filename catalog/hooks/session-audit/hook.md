---
name: session-audit
description: Runs the vault audit on session start and appends the summary to today's daily note. Use to keep a running audit log per session.
type: hook
version: 0.1.0
bundle: Vault Audit
requires: []
dependsOn: []
---

> **`$VAULT` prerequisite:** set `VAULT` to your vault's absolute path before relying on this hook (e.g. `export VAULT=/path/to/your/vault` in your shell profile or the Claude Code environment). Without it the shell expansion `$VAULT/$(date ...).md` resolves to a path under your home directory instead of the vault.

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
