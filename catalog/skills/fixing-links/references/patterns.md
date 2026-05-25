# Link Repair Patterns

## Renamed note

Old: `[[old-name]]` → New: `[[new-name]]`
Check if the target exists with vault_read before replacing.

## Capitalisation mismatch

Obsidian links are case-insensitive on most platforms but case-sensitive on Linux.
Normalise to the exact filename capitalisation from vault_list.

## Dangling links with no plausible target

Prefix with a `> [!warning] Broken link` callout and leave the original text intact
rather than silently deleting it.
