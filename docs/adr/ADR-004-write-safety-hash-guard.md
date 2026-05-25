---
id: ADR-004
title: vault.write safety — explicit mode and expectedHash guard
status: accepted
date: 2026-05-25
references:
  - src/infrastructure/obsidian/mcp/registerVaultTools.ts
  - src/application/mcp/vaultWrite.ts
  - src/domain/settings/PluginSettings.ts
supersedes: []
---

# ADR-004 — vault.write safety — explicit mode and expectedHash guard

## Context

The original `vault.write` implementation wrote (or overwrote) a vault file whenever it was called. There was no distinction between creating a new file and replacing an existing one. This was a data-loss footgun: an agent that misidentified a path or received a stale file list could silently replace a note with different content, with no warning and no way to detect the conflict.

The upstream reference for this problem is cyanheads/obsidian-mcp-server's patch-first design, which uses a separate `patch` operation for modifications and refuses blind overwrite on `write`. The same principle applies here: an agent writing to the vault should demonstrate that it has seen the current content before replacing it.

## Decision

`vault.write` now requires an explicit `mode` parameter:

| Mode          | Behaviour                                                                                                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'create'`    | (default) Creates the file. Returns `file_exists` error if the file already exists.                                                                                                                 |
| `'overwrite'` | Replaces the file. Requires `expectedHash` (SHA-256 hex of the current content). Returns `hash_mismatch` if the hash does not match; returns `expected_hash_required` if `expectedHash` is omitted. |
| `'patch'`     | Reserved. Returns `not_implemented` — callers that need surgical edits must use `note.patch` instead.                                                                                               |

The hash check is enforced in the application layer before any vault mutation. `vault.hash` is provided as a companion tool (mode: `allow`) to retrieve the current hash without requiring a full read.

**Migration for existing callers:** replace `vault.write({ path, content })` with:

```
1. vault.hash({ path })           → { hash, size }
2. vault.write({ path, content, mode: 'overwrite', expectedHash: hash })
```

## Rationale

- **Surfaces concurrent-edit conflicts.** If another process (a human editor, Obsidian sync, another agent) modifies the file between the agent's read and write, the hash will differ and the write is rejected rather than silently clobbering the change.
- **Aligns with cyanheads/obsidian-mcp-server patch-first design.** Separating create from overwrite, and requiring proof-of-read for overwrite, is the established pattern in the MCP vault-tool ecosystem.
- **Minimal API surface for the safe path.** Creating a new file remains a single call. Only overwrites require the two-step pattern.
- **Fail-safe default.** `mode: 'create'` is the default. An agent that omits `mode` gets the safe behaviour (create-only). It must explicitly opt into overwrite semantics, which surfaces the intent and the responsibility.
- **`note.patch` for surgical edits.** Agents that need to modify a specific section of an existing note should use `note.patch` (anchor-based) rather than read–modify–write–overwrite cycles. This reduces the window for hash conflict and makes the edit intent explicit.

## Consequences

- **Breaking change for existing clients.** Any client that called `vault.write` without `mode` to overwrite a file will now receive a `file_exists` error. The migration path is documented in the README troubleshooting section and CHANGELOG.
- **Two-call pattern for overwrites.** `vault.hash` + `vault.write` replaces the previous single-call overwrite. The extra call is cheap (hash-only, no content transfer) and the latency is acceptable.
- **Hash-mismatch on fast-changing files.** Notes that are being actively edited in Obsidian at the moment of the agent's write will fail with `hash_mismatch`. The agent should re-read and re-hash before retrying — this is the intended behaviour.
- **`note.patch` as the preferred write path.** For structured modifications (append to a section, update a frontmatter key), `note.patch` should be preferred over `vault.write` because it is anchor-scoped and does not require transferring the full file content.
