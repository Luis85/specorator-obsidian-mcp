# Catalog application layer

This folder is the Workflow Catalog installer engine — pure-domain logic
behind the `FileSystem` port. The Obsidian-side glue lives in
`src/plugin/CatalogSettingsTab.ts` + `src/infrastructure/obsidian/catalog/catalogFs.ts`.

See ADR-005 for the install state machine.

## File responsibilities

| File | Role |
|---|---|
| `installer.ts` | Public API: `enableAsset` / `disableAsset` / `updateAsset`. Orchestrates the pipeline. |
| `deps.ts` | Topological sort of `dependsOn` references; cycle detection. |
| `platforms.ts` | `targetPath(asset, platform)` mapping table; `supportedPlatforms`. |
| `render.ts` | `renderAsset(asset, platform, allowedTools)` — produces file content per asset type + platform format (YAML / TOML / markdown). |
| `conflict.ts` | `decideAction({ exists, tracked, hashMatches })` → action enum. |
| `scanner.ts` | Injection + hidden-unicode + override + blob + html-embed + IDN + frontmatter-wildcard detection. Hard-blocks the install when triggered. |
| `policy.ts` | Destructive-tool deny-list + `partitionTools` + `allowedToolsLine` (R5 least-privilege grant). |
| `sidecar.ts` | `.specorator/installed.json` read/save/remove — install state tracking. |
| `auditlog.ts` | `.specorator/audit-log.jsonl` append-only log: install + tool-call entries; 5MB rotation. |
| `hooks.ts` | `mergeHook` / `unmergeHook` — hooks.json shared-file merge tagged with `_specorator: id`. |
| `gemini.ts` | `gemini-extension.json` manifest emitter (Gemini-only). |
| `backup.ts` | Timestamped `.bak` rotation for user-modified files. |
| `hash.ts` | sha256 helper. |
| `requires.ts` | `checkRequires` — does the running MCP server expose the tools the asset needs? |
| `source.ts` | `loadBundledCatalog` — parses the build-time-generated `catalog/index.json`. |
| `types.ts` | Shared types: `AssetMeta`, `InstalledRecord`, `FileSystem` port. |

## Test fakes

`tests/__fakes__/memfs.ts` is the in-memory `FileSystem` impl. Use it directly in tests; the production adapter (`obsidianFs`) is thin.
