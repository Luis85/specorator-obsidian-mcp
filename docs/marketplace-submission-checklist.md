# Marketplace submission checklist

Use this checklist when submitting the plugin to the Obsidian Community Plugins marketplace.

## Pre-flight (all should be true)

- [ ] `develop` is fully merged into `main` and `main` is the latest release tag's commit.
- [ ] The latest tag exists on `main` (e.g., `0.1.0`).
- [ ] The GitHub release for that tag has `main.js`, `manifest.json`, and `styles.css` attached as assets (the release workflow does this automatically).
- [ ] `npm run verify` passes locally on `main`.
- [ ] BRAT install in a fresh test vault works end-to-end: install BRAT → Add Beta Plugin → paste `Luis85/specorator-obsidian-mcp` → enable → start server → call a tool via curl or claude CLI.

## Submit

1. Fork `obsidianmd/obsidian-releases`.
2. Edit `community-plugins.json`. Add this entry (alphabetical order by `id`):
   ```json
   {
     "id": "specorator-obsidian-mcp",
     "name": "Specorator Obsidian MCP",
     "author": "Luis Mendez",
     "description": "Lets AI tools (Claude, Cursor, Claude Desktop) read and write your Obsidian vault over a secure local connection.",
     "repo": "Luis85/specorator-obsidian-mcp"
   }
   ```
3. Commit: `Add plugin: Specorator Obsidian MCP`.
4. Open PR against `obsidianmd/obsidian-releases:master`. Title: `Add plugin: Specorator Obsidian MCP`. Body: paste the [PR template](https://github.com/obsidianmd/obsidian-releases/blob/master/.github/pull_request_template.md) checklist and check each box honestly.
5. Wait for the reviewer to flag issues. Common asks:
   - User-facing description (we cover this).
   - SECURITY.md (we cover this).
   - License clearly stated (MIT in LICENSE + README).
   - `isDesktopOnly` correct (yes, http server is Node-only).
   - No `console.log` in production (verify before submitting).
6. Address feedback, push to your fork branch, the PR updates automatically.
7. Once merged, the marketplace listing goes live within a few hours.

## Post-launch

- Update README's "Install" section to add the Community Plugins method.
- Add a screenshot of the settings tab and the ask modal.
- Bump CHANGELOG to reflect the marketplace launch.
