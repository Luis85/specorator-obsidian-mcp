# Contributing to specorator-obsidian-mcp

## Setup

```sh
git clone https://github.com/<owner>/specorator-obsidian-mcp.git
cd specorator-obsidian-mcp
npm install
npm run verify       # must exit 0 before opening a PR
```

`npm run verify` runs audit, typecheck, lint, tests, both builds, and API docs in one pass. Keep it green.

## Branching

| Branch    | Purpose                                                                  |
| --------- | ------------------------------------------------------------------------ |
| `develop` | Integration branch. Cut all feature branches from here; PRs target here. |
| `demo`    | Preview branch. GitHub Pages deploys from here (PR from `develop` only). |
| `main`    | Stable release gate. Only merges from `develop`.                         |

- **Branch name:** `<type>/<short-kebab>` — types: `feature`, `fix`, `docs`, `chore`, `refactor`.
- **To cut a release:** PR `develop` → `main`, merge, then tag `main` HEAD with the plain semver version `X.Y.Z` (no `v` prefix). Use `npm version <bump>` to keep `manifest.json`, `package.json`, `versions.json`, and the tag in sync.
- Never push directly to `main`. Never tag from any branch other than `main`.

## Running tests

```sh
npm test                  # single pass (Vitest)
npm run test:watch        # watch mode
npm run test:coverage     # unit tests + lcov coverage report
```

Hard coverage thresholds: 80/70/80/80 (statements/branches/functions/lines). Thresholds are enforced by `npm run verify`.

## Integration tests

Integration tests that invoke the real Obsidian CLI binary are gated behind the `OBSIDIAN_BIN` environment variable. They are **skipped automatically** when the variable is absent, so `npm test` and CI always pass without Obsidian installed.

To exercise the CLI adapter against the real binary:

```sh
OBSIDIAN_BIN=/path/to/obsidian npm test
# Windows (PowerShell):
$env:OBSIDIAN_BIN = "C:\path\to\obsidian.exe"; npm test
```

These tests live in `tests/infrastructure/node/NodeObsidianCliAdapter.integration.test.ts`. No vault is required — only the Obsidian CLI binary needs to be present and executable. The suite covers `obsidian version`, `obsidian help`, and an unknown-command error path.

## Code style

- **Prettier** runs automatically as part of `npm run format`. Check only: `npm run format:check`.
- **ESLint** must pass (`npm run lint`). Fix automatically with `npm run lint:fix`.
- **`verbatimModuleSyntax` is on.** Import types with `import type { Foo }` rather than `import { Foo }`. The compiler will error otherwise.
- Domain and application layers must not import `obsidian` directly — use a port.

## Architecture

The codebase follows DDD layered architecture with strict inward-only imports:

```
domain ← application ← infrastructure ← plugin
```

Key decisions are recorded as ADRs under `docs/adr/`:

- [`ADR-001-loopback-mcp-server.md`](docs/adr/ADR-001-loopback-mcp-server.md) — in-process loopback MCP server design
- [`ADR-002-permission-modes.md`](docs/adr/ADR-002-permission-modes.md) — allow/ask/deny permission model

## Adding a new MCP tool

1. **Pick the right `register*Tools` file** under `src/infrastructure/obsidian/mcp/` (e.g. `registerVaultTools.ts`). Create a new file only if the tool belongs to a new namespace that has no existing file.

2. **Add the tool name to `DEFAULT_TOOL_MODES`** in `src/domain/settings/PluginSettings.ts`. This map is the source-of-truth registry; tests assert against it with exact equality. Pick a default mode that matches the tool's risk profile (`allow` for reads, `ask` for writes, `deny` for dangerous tools).

3. **If it is a write tool:** thread `gate: PermissionGate` through the deps object and call `await gate.resolve(toolName, params)` before any vault mutation. Check `decision === 'deny'` and return `deny()` early. Strip large or secret fields (e.g. `content`) from the `params` passed to the gate — keep only what the confirmation modal needs to show.

4. **Apply `normalizeVaultPath`** (from `shared.ts`) on every path-shaped parameter before use. Return `err(...)` immediately if normalisation throws.

5. **Use the shared response helpers** from `shared.ts`:
   - `ok(payload)` — success with a JSON text block
   - `deny(toolName)` — permission-denied envelope
   - `err(message)` — error envelope

6. **Write tests** in the matching file under `tests/infrastructure/obsidian/mcp/`. Include:
   - An exact-equality assertion on the full set of registered tool names (registration test).
   - At least one behavioural test per tool (happy path + gate-denied path for write tools).

7. **Update the README capability matrix** to document the new tool, its default mode, and what it does.

## Tool naming convention

Tool names follow the pattern `<namespace>.<verb>` (e.g. `vault.read`, `canvas.write`). For tools with a sub-namespace, use `<namespace>.<sub>.<verb>` (e.g. `cli.read.find`, `cli.read.list`).

**`cli.execute` is a known exception.** It was named before the sub-namespace convention solidified and is kept as-is because renaming a published tool name breaks any client that has already registered it in their MCP config. Future tools in the `cli` namespace that perform reads should use `cli.read.<verb>`; new action tools should use `cli.<verb>` only if the name is unambiguous and has no sub-namespace siblings.

## Reporting bugs / security issues

Security vulnerabilities: see `SECURITY.md` (coming soon). For now e-mail the maintainer directly rather than opening a public issue.

Non-security bugs: open a GitHub issue using the bug-report template.
