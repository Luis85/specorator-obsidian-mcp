---
term: 'expected hash'
aliases: ['expectedHash', 'hash guard', 'write guard']
category: technical
status: accepted
version: unreleased
related:
  - src/infrastructure/obsidian/mcp/registerVaultTools.ts
  - docs/glossary/note-patch.md
  - docs/adr/ADR-004-write-safety-hash-guard.md
last_updated: 2026-05-25
---

# Expected hash

The `expectedHash` parameter is a SHA-256 hex digest of a vault file's current content, passed to `vault.write` when calling with `mode: 'overwrite'`. The server computes the live hash of the file on disk and returns `hash_mismatch` if the two values differ — indicating that the file was modified between the agent's last read and its write attempt.

The companion tool `vault.hash` retrieves the current hash without reading the full file content. The two-step pattern (`vault.hash` → `vault.write` with `expectedHash`) replaces the previous single-call blind overwrite and surfaces concurrent-edit conflicts rather than silently clobbering changes.

See [ADR-004](../adr/ADR-004-write-safety-hash-guard.md) for the full rationale and migration guide.
