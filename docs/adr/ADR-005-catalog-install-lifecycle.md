---
id: ADR-005
title: Catalog asset install lifecycle (scan → conflict → write → sidecar → audit)
status: accepted
date: 2026-05-26
references:
  - src/application/catalog/installer.ts
  - src/application/catalog/sidecar.ts
  - src/application/catalog/scanner.ts
  - src/application/catalog/conflict.ts
  - src/application/catalog/hooks.ts
---

# ADR-005 — Catalog asset install lifecycle

## Decision

The Workflow Catalog installer (`src/application/catalog/installer.ts`) follows a fixed pipeline for every asset enable:

1. **Scan** — `scanForInjection(asset.body)` runs before any write. Hard-block findings (hidden-unicode, html-embed, allowed-tools-wildcard) throw `ScanBlockedError` and abort the install.
2. **Resolve deps** — `resolveOrder(rootId, catalog)` returns assets in dependency order. Each is installed in turn; per-asset failure rolls back only that asset's files.
3. **Per-platform routing** — `targetPath(asset, platform)` maps to a vault-relative path; `renderAsset(asset, platform, allowedTools)` produces the file content. Hook assets use a separate `installHookAsset` → `mergeHook` path that targets the platform's shared `hooks.json`.
4. **Conflict decision** — `decideAction({ exists, tracked, hashMatches })` returns one of `write`, `conflict`, `safe-overwrite`, `user-modified`. The installer invokes `onConflict`/`onUserModified` callbacks (the UI's `ConflictModal`) when user input is needed.
5. **Write** — via the `FileSystem` port (production: `obsidianFs(app)`; tests: `memFs`). Atomic per file.
6. **Sidecar** — `saveRecord(fs, id, { version, platforms, paths, hash })` persists install state to `.specorator/installed.json`.
7. **Audit** — `appendAudit(fs, { kind: 'install', action: 'enable', id, hash })` to `.specorator/audit-log.jsonl`.
8. **Session-allow invalidation** — for tools listed in `asset.requires`, call `opts.gate.invalidateSessionAllow(t)` so prior session grants don't carry to the new install.

## Rationale

- **Pre-write scan** — the scan-gate is the trust boundary for catalog-bundled assets. Even our own assets pass through it, so bundled-vs-remote is the same code path. (Setting up for the Phase 3 remote source.)
- **Per-asset rollback (not per-batch)** — a multi-asset install where asset 5 fails leaves assets 1–4 installed. They are not rolled back; they're independently useful. The failed asset's partial writes are reverted.
- **`.specorator/` is in pathDenyList** — MCP tool calls can't poison the audit log or rewrite the sidecar. The installer writes via the privileged FileSystem port, not through MCP.
- **Hooks always merge** — never overwrite. The `mergeHook` step combines our entry with the user's existing hook config; `unmergeHook` removes only our entry. Manual edits between merges are preserved unless the user explicitly chose Overwrite via the conflict modal.

## Consequences

- The installer is the only place that writes to `.claude/`, `.cursor/`, `.codex/`, `.gemini/` paths.
- Adding a new platform requires extending `platforms.ts` + `render.ts` (one row each).
- Adding a new asset type requires extending `installer.ts` (new branch in `installAsset` for the type) + `platforms.ts`.
- Rollback semantics are per-asset, not per-batch — multi-asset enable failures leave a partial state by design.

## Alternatives considered

- **No scan for bundled assets** — rejected. Bundled is "trusted today" but the same code path serves a future remote source; the scan keeps the boundary uniform.
- **Per-batch rollback** — rejected. Users expect partial-install success when most assets work; only the failing asset reverts.
- **Track hooks per asset** — rejected. Hooks live in a shared `hooks.json` that other tools also write; we tag our entries with `_specorator: id` and unmerge by tag.
