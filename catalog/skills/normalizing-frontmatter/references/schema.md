# Frontmatter Schema Reference

## Canonical fields

- `title`: string — human-readable title (optional; defaults to filename)
- `tags`: string[] — lowercase-hyphen tags
- `created`: ISO date string (YYYY-MM-DD)
- `updated`: ISO date string (YYYY-MM-DD)
- `status`: one of `draft | active | archived`

## Normalisation rules

- Tags: lowercase, hyphens only (no spaces, no `#` prefix).
- Dates: ISO-8601 short form (YYYY-MM-DD), not locale strings.
- Remove unknown fields only on explicit user confirmation.
