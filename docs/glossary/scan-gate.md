---
term: 'scan gate'
aliases: ['scan-gate', 'ScanBlockedError', 'scanForInjection', 'pre-write scan']
category: technical
status: accepted
version: '0.1.0'
related:
  - src/application/catalog/scanner.ts
  - docs/adr/ADR-005-catalog-install-lifecycle.md
last_updated: 2026-05-26
---

# Scan gate

The first step of the catalog install pipeline. `scanForInjection(asset.body)` runs against every asset's body before any file is written to disk. If the scan returns a hard-block finding, the installer throws `ScanBlockedError` and the install is aborted with no vault side effects.

Hard-block kinds (`HARD_BLOCK_KINDS` in `src/application/catalog/scanner.ts`):

| Kind | What it catches |
|------|----------------|
| `hidden-unicode` | Bidi / zero-width / tag-block characters used to hide instructions |
| `html-embed` | Active HTML tags (`<img>`, `<script>`, `<iframe>`, etc.) that load external resources |
| `allowed-tools-wildcard` | `allowed-tools: *` frontmatter — grants every MCP tool without restriction |

Advisory findings (shown in the consent UI but not auto-blocking) include `override`, `external-url`, `blob`, `destructive-tool`, `idn-homograph`, and `override-dilution`.

The scan runs unconditionally on both bundled and future remote assets — the same code path ensures the trust boundary is uniform. Accepting a hard-block requires a code change to `HARD_BLOCK_KINDS`, not just user confirmation.
