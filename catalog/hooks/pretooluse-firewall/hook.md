---
name: pretooluse-firewall
description: Blocks destructive raw-shell calls (rm/curl/wget) before they run. Use to harden a vault against accidental or injected destructive shell actions (destructive MCP tools are gated server-side by toolModes).
type: hook
version: 0.1.0
bundle: Vault Audit
requires: []
dependsOn: []
---

```json
{
  "id": "pretooluse-firewall",
  "event": "PreToolUse",
  "entry": {
    "matcher": "Bash",
    "command": "sh -c 'in=$(cat); for p in \"rm -rf\" \"rm \" curl wget \"find \" \"dd \"; do case \"$in\" in *\"$p\"*) echo \"specorator-firewall: blocked $p\" >&2; exit 2;; esac; done; exit 0'"
  }
}
```
