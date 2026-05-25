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

Run a single test file:

```sh
npx vitest run tests/infrastructure/obsidian/mcp/registerVaultTools.test.ts
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
- [`ADR-003-server-side-aggregation.md`](docs/adr/ADR-003-server-side-aggregation.md) — audit/aggregate tools compute server-side
- [`ADR-004-write-safety-hash-guard.md`](docs/adr/ADR-004-write-safety-hash-guard.md) — vault.write requires expectedHash to overwrite

## Adding a new MCP tool

1. **Pick the right `register*Tools` file** under `src/infrastructure/obsidian/mcp/` (e.g. `registerVaultTools.ts`). Create a new file only if the tool belongs to a new namespace that has no existing file.

2. **Add the tool name to `DEFAULT_TOOL_MODES`** in `src/domain/settings/PluginSettings.ts`. This map is the source-of-truth registry; tests assert against it with exact equality. Pick a default mode that matches the tool's risk profile (`allow` for reads, `ask` for writes, `deny` for dangerous tools).

3. **If it declares `outputSchema`:** use `okStructured(payload)` (not `ok(payload)`) to return the structured response. Using `ok()` when `outputSchema` is declared produces an "Output validation error: no structured content" failure on the client side.

4. **Apply `normalizeVaultPath`** (from `shared.ts`) on every path-shaped parameter before use. Treat `.` and `''` as vault root via `isVaultRoot` — do not reject them. Return `err(...)` immediately if normalisation throws for any other reason.

5. **If it is a write tool:** thread `gate: PermissionGate` through the deps object and call `await gate.resolve(toolName, params)` before any vault mutation. Check `decision === 'deny'` and return `deny()` early. Pass **minimal params** to `gate.resolve` — strip large or sensitive fields (e.g. `content`) that are not needed to describe the action in the confirmation modal.

6. **Use the shared response helpers** from `shared.ts`:
   - `ok(payload)` — success with a JSON text block (use only when no `outputSchema` is declared)
   - `okStructured(payload)` — success with a structured JSON block (required when `outputSchema` is declared)
   - `deny(toolName)` — permission-denied envelope
   - `err(message)` — error envelope

7. **Write tests** in the matching file under `tests/infrastructure/obsidian/mcp/`. Include:
   - An exact-equality assertion on the full set of registered tool names (registration test) — use the exact name as it appears in `DEFAULT_TOOL_MODES`.
   - At least one behavioural test per tool (happy path + gate-denied path for write tools).

8. **Update the README capability matrix** to document the new tool, its default mode, and what it does.

## Tool naming convention

Tool names follow the pattern `<namespace>.<verb>` (e.g. `vault.read`, `canvas.write`). For tools with a sub-namespace, use `<namespace>.<sub>.<verb>` (e.g. `cli.read.find`, `cli.read.list`).

**`cli.execute` is a known exception.** It was named before the sub-namespace convention solidified and is kept as-is because renaming a published tool name breaks any client that has already registered it in their MCP config. Future tools in the `cli` namespace that perform reads should use `cli.read.<verb>`; new action tools should use `cli.<verb>` only if the name is unambiguous and has no sub-namespace siblings.

**`cli.*` snake_case exception.** `cli.daily_note`, `cli.workspace_load`, `cli.template_insert`, and `cli.open_file` use snake_case for historical reasons (added before the naming convention was written down). New tools should follow the dominant pattern: lowercase dot-separated single-word verbs where possible (e.g. `cli.reload`, `cli.screenshot`). Do not rename the existing snake_case tools — renaming a published tool name breaks client configs.

**`cli.execute` vs `cli.run` — naming gap.** These two tools look superficially similar but do different things:

| Tool          | What it does                                                                                                                            | Surface          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `cli.execute` | Calls `app.commands.executeCommandById` — runs an in-process Obsidian command palette command, sandboxed by Obsidian's command surface. | In-process       |
| `cli.run`     | Spawns the official `obsidian` CLI binary as a subprocess with an arbitrary command and arguments.                                      | External process |

They have separate allow-lists (`cliExecuteAllowedPrefixes` vs `cliRunAllowedPrefixes`) because the risk profiles differ. In particular, `cli.run` can invoke commands such as `eval` that have no equivalent in the command palette, so conflating the two lists would silently widen the attack surface of `cli.execute` allow-list entries.

## Adding a graph/audit/aggregate tool

Aggregate tools compute a summary server-side and return one payload rather than exposing raw per-note data that the agent would have to enumerate. This keeps MCP call counts low and avoids leaking note content the agent did not ask for. See [ADR-003](docs/adr/ADR-003-server-side-aggregation.md) for rationale.

Pattern to follow:

1. **Pure logic in `src/application/mcp/<name>.ts`.** The function receives port interfaces only (no Obsidian imports) and returns a plain serialisable object. Write unit tests against this function directly — no MCP wiring needed.

2. **Thin MCP registrar in `src/infrastructure/obsidian/mcp/register<Name>Tool(s).ts`.** The registrar imports the application function, calls it with port instances from deps, and wraps the result in `okStructured()`.

3. **Use existing helpers** — `audit.ts`, `graph.ts`, and `matchGlob.ts` in `src/application/mcp/` provide shared utilities. Prefer extending them over duplicating.

4. **Default mode `allow`** if the tool is read-only and bounded (does not return full note content). If the output could expose sensitive bulk data, use `ask`.

5. **Declare `outputSchema`** and use `okStructured` — aggregate tools always return structured JSON so clients can process results programmatically.

## Adding a catalog asset

Catalog assets live under `catalog/<type>/<id>/` where `<type>` is one of `skill`, `command`, `agent`, or `hook`. The primary file for each type is:

| Type    | File         |
| ------- | ------------ |
| skill   | `SKILL.md`   |
| command | `command.md` |
| agent   | `agent.md`   |
| hook    | `hook.md`    |

**Required frontmatter fields:**

| Field         | Notes                                                 |
| ------------- | ----------------------------------------------------- |
| `name`        | Gerund phrase for skills (e.g. "Reading vault files") |
| `description` | Must include a "use when" trigger phrase              |
| `type`        | One of `skill`, `command`, `agent`, `hook`            |
| `version`     | Semver string                                         |
| `bundle`      | The bundle this asset belongs to                      |
| `requires`    | List of MCP tool names this asset depends on          |
| `dependsOn`   | List of other asset IDs this asset depends on         |

After creating the asset file, run `npm run build:catalog` to regenerate `catalog/index.json`. Confirm the new asset appears in the index, then commit both the asset file and the updated index together.

## Common first-PR failures

- **Missing entry in `DEFAULT_TOOL_MODES`** — the registration test in the matching `register*.test.ts` file prints a set-diff of expected vs actual tool names. Add the tool to `DEFAULT_TOOL_MODES` in `src/domain/settings/PluginSettings.ts`.
- **New registrar not added to the barrel** — if you created a new `register*Tools.ts` file, export it from `src/infrastructure/obsidian/mcp/index.ts`.
- **Registrar not wired in `ObsidianMcpServerAdapter`** — a tool registered in a file but not called from `ObsidianMcpServerAdapter` will be absent from the live server. Check that `server.tool(...)` is reachable at runtime.
- **`verbatimModuleSyntax` violation** — the TypeScript config requires `import type { Foo }` for type-only imports. Using `import { Foo }` for a type causes a compile error.
- **Skipped `okStructured` when declaring `outputSchema`** — if your tool declares `outputSchema` but returns `ok(payload)` instead of `okStructured(payload)`, the MCP SDK throws "Output validation error: no structured content" on the client side.

## Where things live

| Concept                      | File path                                                          |
| ---------------------------- | ------------------------------------------------------------------ |
| Tool mode defaults           | `src/domain/settings/PluginSettings.ts` — `DEFAULT_TOOL_MODES`     |
| Canonical tool name list     | `src/application/mcp/ToolModeRegistry.ts` — `CANONICAL_TOOL_NAMES` |
| MCP tool registrars (vault)  | `src/infrastructure/obsidian/mcp/registerVaultTools.ts`            |
| MCP tool registrars (cli.read.*) | `src/infrastructure/obsidian/mcp/registerObsidianCliReadTools.ts` — covers `cli.read.find`, `cli.read.list`, etc. |
| MCP tool registrars (cli.execute + curated cli.*) | `src/infrastructure/obsidian/mcp/registerObsidianCliTools.ts` — covers `cli.execute`, `cli.screenshot`, `cli.daily_note`, etc. |
| MCP tool registrars (barrel) | `src/infrastructure/obsidian/mcp/index.ts`                         |
| MCP server wiring            | `src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts`          |
| Shared response helpers      | `src/infrastructure/obsidian/mcp/shared.ts`                        |
| Application-layer aggregates | `src/application/mcp/` (audit, graph, frontmatter query, etc.)     |
| Permission gate              | `src/application/mcp/PermissionGate.ts`                            |
| Catalog assets               | `catalog/<type>/<id>/`                                             |
| Catalog index (generated)    | `catalog/index.json`                                               |
| ADRs                         | `docs/adr/`                                                        |

## Reporting bugs / security issues

Security vulnerabilities: see [SECURITY.md](./SECURITY.md). For critical issues, use GitHub's private vulnerability reporting.

Non-security bugs: open a GitHub issue using the bug-report template.
