# Permission UX + Tabbed Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce MCP permission-prompt friction (trusted-writes preset + Claude Code allowlist generator), reorganize plugin settings into four tabs, and give the Codex CLI one-click MCP access like Claude/Cursor.

**Architecture:** Three pure logic modules (TOML block splice, trusted-writes preset, Claude allowlist merge) are built and unit-tested first under `src/application`. `AutoRegister` gains a `format: 'json' | 'toml'` discriminant so the existing JSON path is untouched while a new TOML path serves Codex. Finally the UI is reorganized: `CombinedSettingsTab` becomes a tab-bar host and `settings.ts` splits into per-tab render functions that surface the new permission features.

**Tech Stack:** TypeScript, Obsidian Plugin API, Vitest (`tests/**/*.test.ts`, aliases `@`→`src`, `@@`→`tests`), esbuild bundle. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-05-26-permission-ux-tabbed-settings-design.md`

**Conventions (verified):**
- Run a single test file: `npx vitest run tests/<path>.test.ts`
- Run whole suite: `npm test`
- Typecheck: `npm run typecheck` · Lint: `npm run lint` · Format check: `npm run format:check`
- Unit tests use `MockFileSystemPort` (`@/infrastructure/mock/MockFileSystemPort`) which exposes `.files: Map<string,string>` and `writeCallCount`.
- `src/plugin/**` and `src/infrastructure/obsidian/**` are **excluded from coverage** (vitest.config.ts) — UI tasks are verified by typecheck/build/lint + manual smoke, not unit tests.
- Commit message footer (every commit):
  ```
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```

---

## File Structure

| File | Responsibility | Task |
|------|----------------|------|
| `src/application/mcp/tomlBlock.ts` (create) | Pure text splice of one TOML table block; preserves rest of file | 1 |
| `tests/application/mcp/tomlBlock.test.ts` (create) | Unit tests for splice/remove/read | 1 |
| `src/application/mcp/AutoRegister.ts` (modify) | Add `format` discriminant + TOML register/deregister path; add `codex` target | 2 |
| `tests/application/mcp/AutoRegister.codex.test.ts` (create) | Unit tests for the Codex TOML path | 2 |
| `src/domain/settings/PluginSettings.ts` (modify) | Add `codex` to `AutoRegisterSettings` + `DEFAULT_AUTO_REGISTER` | 3 |
| `src/application/settings/presets.ts` (modify) | `SAFE_WRITE_TOOLS`, `DESTRUCTIVE_TOOLS`, `trusted-writes` preset | 4 |
| `tests/application/settings/presets.test.ts` (modify) | Tests for `trusted-writes` | 4 |
| `src/application/settings/claudeAllowlist.ts` (create) | Pure: tool-id mapping + `.claude/settings.json` allowlist merge | 5 |
| `tests/application/settings/claudeAllowlist.test.ts` (create) | Unit tests for mapping + merge | 5 |
| `src/plugin/modals/ClaudeAllowlistConsentModal.ts` (create) | Consent modal before writing `.claude/settings.json` | 6 |
| `src/plugin/settings.ts` (modify) | Split into `renderServerTab` / `renderPermissionsTab` / `renderAdvancedTab`; retire `SpecoratorMcpSettingsTab`; add trusted-writes button, tier legend, ask-timeout copy, allowlist button | 7 |
| `src/plugin/CombinedSettingsTab.ts` (modify) | Tab-bar host with `activeTab` state | 7 |

**Task order rationale:** Tasks 1–5 are pure logic with full TDD. Task 6 is a small UI component. Task 7 is the integrating UI refactor that places every new control in its tab — done last so each new control lands in its final home (no double-handling).

---

## Task 1: TOML block splice module

**Files:**
- Create: `src/application/mcp/tomlBlock.ts`
- Test: `tests/application/mcp/tomlBlock.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/application/mcp/tomlBlock.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  upsertTomlBlock,
  removeTomlBlock,
  readTomlBlockUrl,
  hasTomlBlock,
} from '@/application/mcp/tomlBlock'

const HEADER = 'mcp_servers.specorator-obsidian-mcp'
const URL = 'http://127.0.0.1:7842/mcp'

describe('upsertTomlBlock', () => {
  it('appends a block to empty content', () => {
    const out = upsertTomlBlock('', HEADER, [`url = "${URL}"`])
    expect(out).toBe(`[${HEADER}]\nurl = "${URL}"\n`)
  })

  it('appends after existing content, preserving comments and other tables', () => {
    const existing = `# my config\nmodel = "o3"\n\n[mcp_servers.other]\nurl = "http://other/mcp"\n`
    const out = upsertTomlBlock(existing, HEADER, [`url = "${URL}"`])
    expect(out).toContain('# my config')
    expect(out).toContain('model = "o3"')
    expect(out).toContain('[mcp_servers.other]')
    expect(out).toContain(`[${HEADER}]\nurl = "${URL}"`)
  })

  it('replaces an existing block in place when the url changed', () => {
    const existing = `[${HEADER}]\nurl = "http://old/mcp"\n\n[other]\nx = 1\n`
    const out = upsertTomlBlock(existing, HEADER, [`url = "${URL}"`])
    expect(out).toContain(`url = "${URL}"`)
    expect(out).not.toContain('http://old/mcp')
    // the unrelated [other] table survives
    expect(out).toContain('[other]')
    expect(out).toContain('x = 1')
  })

  it('handles a hyphenated bare-key header', () => {
    const out = upsertTomlBlock('', HEADER, [`url = "${URL}"`])
    expect(out.startsWith(`[${HEADER}]`)).toBe(true)
  })
})

describe('readTomlBlockUrl', () => {
  it('reads the url within our block only', () => {
    const content = `[other]\nurl = "http://wrong/mcp"\n\n[${HEADER}]\nurl = "${URL}"\n`
    expect(readTomlBlockUrl(content, HEADER)).toBe(URL)
  })

  it('returns null when our block is absent', () => {
    expect(readTomlBlockUrl(`[other]\nurl = "x"\n`, HEADER)).toBeNull()
  })
})

describe('hasTomlBlock', () => {
  it('detects presence of our header', () => {
    expect(hasTomlBlock(`[${HEADER}]\nurl = "${URL}"\n`, HEADER)).toBe(true)
    expect(hasTomlBlock(`[other]\n`, HEADER)).toBe(false)
  })
})

describe('removeTomlBlock', () => {
  it('removes our block and keeps other tables', () => {
    const existing = `[${HEADER}]\nurl = "${URL}"\n\n[other]\nx = 1\n`
    const out = removeTomlBlock(existing, HEADER)
    expect(out).not.toContain(HEADER)
    expect(out).toContain('[other]')
    expect(out).toContain('x = 1')
  })

  it('returns content unchanged when our block is absent', () => {
    const existing = `[other]\nx = 1\n`
    expect(removeTomlBlock(existing, HEADER)).toBe(existing)
  })

  it('returns empty string when the file held only our block', () => {
    expect(removeTomlBlock(`[${HEADER}]\nurl = "${URL}"\n`, HEADER)).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/application/mcp/tomlBlock.test.ts`
Expected: FAIL — `Failed to resolve import "@/application/mcp/tomlBlock"`.

- [ ] **Step 3: Write the implementation**

Create `src/application/mcp/tomlBlock.ts`:

```typescript
/**
 * Format-preserving editor for a single TOML table block (e.g.
 * `[mcp_servers.specorator-obsidian-mcp]`). Operates on raw text and never
 * parses the whole document, so comments, key order, and unrelated tables are
 * left byte-for-byte intact. `header` is the dotted table path WITHOUT brackets.
 */

/** A trimmed line that opens a TOML table or array-of-tables: `[x]` / `[[x]]`. */
function isTableHeader(line: string): boolean {
  return line.trim().startsWith('[')
}

function headerLine(header: string): string {
  return `[${header}]`
}

/** Index of the line that is exactly `[header]`, or -1. */
function findHeaderIdx(lines: string[], header: string): number {
  const target = headerLine(header)
  return lines.findIndex((l) => l.trim() === target)
}

/** End-exclusive index of our block: the next table header after `start`, else EOF. */
function blockEnd(lines: string[], start: number): number {
  for (let i = start + 1; i < lines.length; i++) {
    if (isTableHeader(lines[i]!)) return i
  }
  return lines.length
}

export function hasTomlBlock(content: string, header: string): boolean {
  return findHeaderIdx(content.split('\n'), header) !== -1
}

/** Insert or replace the table block; preserve everything else. */
export function upsertTomlBlock(content: string, header: string, bodyLines: string[]): string {
  const block = [headerLine(header), ...bodyLines]
  const lines = content.split('\n')
  const headerIdx = findHeaderIdx(lines, header)

  if (headerIdx === -1) {
    const trimmed = content.replace(/\s*$/, '')
    if (trimmed === '') return block.join('\n') + '\n'
    return trimmed + '\n\n' + block.join('\n') + '\n'
  }

  const before = lines.slice(0, headerIdx)
  const after = lines.slice(blockEnd(lines, headerIdx))
  let out = [...before, ...block, ...after].join('\n')
  if (!out.endsWith('\n')) out += '\n'
  return out
}

/** Remove the table block; collapse the blank-line seam left behind. */
export function removeTomlBlock(content: string, header: string): string {
  const lines = content.split('\n')
  const headerIdx = findHeaderIdx(lines, header)
  if (headerIdx === -1) return content

  const before = lines.slice(0, headerIdx)
  const after = lines.slice(blockEnd(lines, headerIdx))
  // Collapse a doubled blank line at the join.
  while (
    before.length > 0 &&
    before[before.length - 1]!.trim() === '' &&
    after.length > 0 &&
    after[0]!.trim() === ''
  ) {
    after.shift()
  }
  let out = [...before, ...after].join('\n')
  if (out.trim() === '') return ''
  if (!out.endsWith('\n')) out += '\n'
  return out
}

/** Read `url = "..."` from WITHIN our block only (ignores other tables). */
export function readTomlBlockUrl(content: string, header: string): string | null {
  const lines = content.split('\n')
  const headerIdx = findHeaderIdx(lines, header)
  if (headerIdx === -1) return null
  const end = blockEnd(lines, headerIdx)
  for (let i = headerIdx + 1; i < end; i++) {
    const m = lines[i]!.match(/^\s*url\s*=\s*"([^"]*)"\s*$/)
    if (m) return m[1]!
  }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/application/mcp/tomlBlock.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/application/mcp/tomlBlock.ts tests/application/mcp/tomlBlock.test.ts
git commit -m "feat(autoregister): format-preserving TOML block splice helper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: AutoRegister TOML path + Codex target

**Files:**
- Modify: `src/application/mcp/AutoRegister.ts`
- Test: `tests/application/mcp/AutoRegister.codex.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/application/mcp/AutoRegister.codex.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { AutoRegister, SERVER_KEY, wellKnownTargets } from '@/application/mcp/AutoRegister'
import type { AutoRegisterTarget } from '@/application/mcp/AutoRegister'
import { MockFileSystemPort } from '@/infrastructure/mock/MockFileSystemPort'
import { hasTomlBlock, readTomlBlockUrl } from '@/application/mcp/tomlBlock'

const URL = 'http://127.0.0.1:7842/mcp'
const HEADER = `mcp_servers.${SERVER_KEY}`

function codexTarget(): AutoRegisterTarget {
  return { id: 'codex', name: 'Codex CLI', configPath: '/fake/.codex/config.toml', format: 'toml' }
}

describe('AutoRegister codex (toml) register', () => {
  let fs: MockFileSystemPort
  let ar: AutoRegister
  const t = codexTarget()

  beforeEach(() => {
    fs = new MockFileSystemPort()
    ar = new AutoRegister(fs)
  })

  it('writes our [mcp_servers.*] block into a missing file', async () => {
    const results = await ar.register(URL, [t])
    expect(results[0]?.status).toBe('registered')
    const written = fs.files.get(t.configPath)!
    expect(hasTomlBlock(written, HEADER)).toBe(true)
    expect(readTomlBlockUrl(written, HEADER)).toBe(URL)
  })

  it('preserves unrelated tables and comments', async () => {
    fs.files.set(t.configPath, `# codex config\nmodel = "o3"\n\n[mcp_servers.other]\nurl = "http://other/mcp"\n`)
    await ar.register(URL, [t])
    const written = fs.files.get(t.configPath)!
    expect(written).toContain('# codex config')
    expect(written).toContain('[mcp_servers.other]')
    expect(readTomlBlockUrl(written, HEADER)).toBe(URL)
  })

  it('returns unchanged and does not write when url already matches', async () => {
    fs.files.set(t.configPath, `[${HEADER}]\nurl = "${URL}"\n`)
    const before = fs.writeCallCount
    const results = await ar.register(URL, [t])
    expect(results[0]?.status).toBe('unchanged')
    expect(fs.writeCallCount).toBe(before)
  })

  it('writes a .bak before mutating an existing file', async () => {
    const original = `[${HEADER}]\nurl = "http://old/mcp"\n`
    fs.files.set(t.configPath, original)
    await ar.register(URL, [t])
    expect(fs.files.get(`${t.configPath}.bak`)).toBe(original)
  })

  it('records a sidecar hash after register', async () => {
    await ar.register(URL, [t])
    const { sidecarPath } = await import('@/application/mcp/AutoRegister')
    const sidecar = JSON.parse(fs.files.get(sidecarPath())!)
    expect(sidecar[t.configPath]?.sha256).toHaveLength(64)
  })
})

describe('AutoRegister codex (toml) deregister', () => {
  let fs: MockFileSystemPort
  let ar: AutoRegister
  const t = codexTarget()

  beforeEach(() => {
    fs = new MockFileSystemPort()
    ar = new AutoRegister(fs)
  })

  it('removes only our block, keeping other tables', async () => {
    fs.files.set(t.configPath, `[${HEADER}]\nurl = "${URL}"\n\n[mcp_servers.other]\nurl = "http://other/mcp"\n`)
    const results = await ar.deregister([t])
    expect(results[0]?.status).toBe('deregistered')
    const written = fs.files.get(t.configPath)!
    expect(hasTomlBlock(written, HEADER)).toBe(false)
    expect(written).toContain('[mcp_servers.other]')
  })

  it('returns unchanged when our block is absent', async () => {
    fs.files.set(t.configPath, `[mcp_servers.other]\nurl = "x"\n`)
    const before = fs.writeCallCount
    const results = await ar.deregister([t])
    expect(results[0]?.status).toBe('unchanged')
    expect(fs.writeCallCount).toBe(before)
  })
})

describe('wellKnownTargets', () => {
  it('includes a codex target using config.toml + toml format', () => {
    const codex = wellKnownTargets().find((x) => x.id === 'codex')
    expect(codex).toBeDefined()
    expect(codex!.format).toBe('toml')
    expect(codex!.configPath.replace(/\\/g, '/')).toMatch(/\.codex\/config\.toml$/)
  })

  it('existing JSON targets default to json format', () => {
    const claude = wellKnownTargets().find((x) => x.id === 'claudeCli')!
    expect(claude.format ?? 'json').toBe('json')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/application/mcp/AutoRegister.codex.test.ts`
Expected: FAIL — `codex` not assignable to `AutoRegisterTarget['id']`, no `format` field, no codex in `wellKnownTargets`.

- [ ] **Step 3: Extend the target type + wellKnownTargets**

In `src/application/mcp/AutoRegister.ts`, add the `tomlBlock` import at the top (after the existing imports):

```typescript
import { upsertTomlBlock, removeTomlBlock, readTomlBlockUrl, hasTomlBlock } from './tomlBlock'
```

Replace the `AutoRegisterTarget` interface:

```typescript
export interface AutoRegisterTarget {
  id: 'claudeCli' | 'cursor' | 'claudeDesktop' | 'codex'
  name: string
  configPath: string
  /** Config file format. Defaults to 'json' (the historical behavior). */
  format?: 'json' | 'toml'
}
```

Replace `wellKnownTargets()` — add the codex target (config respects `$CODEX_HOME`):

```typescript
export function wellKnownTargets(): AutoRegisterTarget[] {
  const home = homedir()
  const platform = process.platform
  const desktopPath =
    platform === 'darwin'
      ? join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
      : platform === 'win32'
        ? join(process.env['APPDATA'] ?? home, 'Claude', 'claude_desktop_config.json')
        : join(home, '.config', 'Claude', 'claude_desktop_config.json')
  const codexHome = process.env['CODEX_HOME'] ?? join(home, '.codex')
  return [
    { id: 'claudeCli', name: 'Claude CLI', configPath: join(home, '.claude.json'), format: 'json' },
    { id: 'cursor', name: 'Cursor', configPath: join(home, '.cursor', 'mcp.json'), format: 'json' },
    { id: 'claudeDesktop', name: 'Claude Desktop', configPath: desktopPath, format: 'json' },
    { id: 'codex', name: 'Codex CLI', configPath: join(codexHome, 'config.toml'), format: 'toml' },
  ]
}
```

- [ ] **Step 4: Dispatch register/deregister on format**

In `AutoRegister.register`, wrap the existing per-target body with a format branch. Find the loop body inside `for (const t of targets) { try { ... } catch ... }` and make the `try` start by branching:

```typescript
  async register(url: string, targets: AutoRegisterTarget[]): Promise<RegisterResult[]> {
    const out: RegisterResult[] = []
    for (const t of targets) {
      try {
        if ((t.format ?? 'json') === 'toml') {
          out.push(await this.registerToml(t, url))
          continue
        }
        // ── existing JSON path (unchanged) ──
        const existing = await this.fs.readText(t.configPath)
        // ... LEAVE THE REST OF THE EXISTING JSON BODY EXACTLY AS-IS ...
      } catch (err) {
        out.push({ target: t, status: 'failed', reason: (err as Error).message })
      }
    }
    return out
  }
```

Do the same in `deregister` — at the top of the `try`:

```typescript
        if ((t.format ?? 'json') === 'toml') {
          out.push(await this.deregisterToml(t))
          continue
        }
```

Then add two private methods to the class (place them after `deregister`):

```typescript
  // ── TOML path (Codex) ──────────────────────────────────────────────────────
  private tomlHeader(): string {
    return `mcp_servers.${SERVER_KEY}`
  }

  private async registerToml(t: AutoRegisterTarget, url: string): Promise<RegisterResult> {
    const header = this.tomlHeader()
    const existing = await this.fs.readText(t.configPath)
    const content = existing ?? ''
    const priorUrl = readTomlBlockUrl(content, header)

    let externallyMutated = false
    if (priorUrl !== null) {
      externallyMutated = await detectExternalMutation(
        this.fs,
        t.configPath,
        { url: priorUrl },
        this.logger,
      )
    }

    if (!externallyMutated && priorUrl === url) {
      return { target: t, status: 'unchanged' }
    }

    if (existing !== null) {
      await this.fs.writeText(`${t.configPath}.bak`, existing)
    }
    const next = upsertTomlBlock(content, header, [`url = "${url}"`])
    await this.fs.writeText(t.configPath, next)
    await recordWrittenHash(this.fs, t.configPath, { url })
    return { target: t, status: 'registered', externallyMutated }
  }

  private async deregisterToml(t: AutoRegisterTarget): Promise<RegisterResult> {
    const header = this.tomlHeader()
    const existing = await this.fs.readText(t.configPath)
    if (existing === null || !hasTomlBlock(existing, header)) {
      return { target: t, status: 'unchanged' }
    }
    const priorUrl = readTomlBlockUrl(existing, header)
    await detectExternalMutation(this.fs, t.configPath, { url: priorUrl }, this.logger)
    await this.fs.writeText(`${t.configPath}.bak`, existing)
    await this.fs.writeText(t.configPath, removeTomlBlock(existing, header))
    await removeSidecarEntry(this.fs, t.configPath)
    return { target: t, status: 'deregistered' }
  }
```

Note: `detectExternalMutation`, `recordWrittenHash`, `removeSidecarEntry`, and `SERVER_KEY` are already module-level / exported in this file — reuse them; do not redefine.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/application/mcp/AutoRegister.codex.test.ts tests/application/mcp/AutoRegister.test.ts`
Expected: PASS — both the new Codex suite and the unchanged JSON suite (existing `makeTarget` has no `format`, so it defaults to `'json'`).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (`main.ts` indexes `this.settings.autoRegister[t.id]`; `t.id` now includes `'codex'`, satisfied once Task 3 adds the settings key. If typecheck runs before Task 3 it errors on the missing `codex` key — run Task 3 then re-check; or run Tasks 2+3 back-to-back before typechecking.)

- [ ] **Step 7: Commit**

```bash
git add src/application/mcp/AutoRegister.ts tests/application/mcp/AutoRegister.codex.test.ts
git commit -m "feat(autoregister): add Codex CLI target via TOML config path

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Codex setting key + default

**Files:**
- Modify: `src/domain/settings/PluginSettings.ts:6-10` (`AutoRegisterSettings`), `:121-125` (`DEFAULT_AUTO_REGISTER`)

- [ ] **Step 1: Add the `codex` field to the type**

In `src/domain/settings/PluginSettings.ts`, update `AutoRegisterSettings`:

```typescript
export interface AutoRegisterSettings {
  claudeCli: boolean
  cursor: boolean
  claudeDesktop: boolean
  codex: boolean
}
```

- [ ] **Step 2: Add the default (opt-in, false)**

Update `DEFAULT_AUTO_REGISTER`:

```typescript
export const DEFAULT_AUTO_REGISTER: AutoRegisterSettings = Object.freeze({
  claudeCli: true,
  cursor: false,
  claudeDesktop: false,
  codex: false,
})
```

No migration code is needed: `main.ts` `loadSettings()` already builds `autoRegister` as `{ ...DEFAULT_SETTINGS.autoRegister, ...(stored?.autoRegister ?? {}) }`, so existing users whose saved object predates `codex` get `codex: false` automatically.

- [ ] **Step 3: Verify typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: PASS. (Task 2's `main.ts` index access now resolves; no settings test asserts the exact key set, so nothing breaks.)

- [ ] **Step 4: Commit**

```bash
git add src/domain/settings/PluginSettings.ts
git commit -m "feat(settings): add codex auto-register flag (default off)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Trusted-writes preset

**Files:**
- Modify: `src/application/settings/presets.ts`
- Test: `tests/application/settings/presets.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/application/settings/presets.test.ts` (inside the file, after the existing `describe`):

```typescript
import { SAFE_WRITE_TOOLS, DESTRUCTIVE_TOOLS } from '@/application/settings/presets'

describe('applyPreset trusted-writes', () => {
  it('sets every safe-write tool to "allow"', () => {
    const result = applyPreset(base, 'trusted-writes')
    for (const tool of SAFE_WRITE_TOOLS) {
      expect(result.toolModes[tool]).toBe('allow')
    }
  })

  it('keeps destructive tools at "ask"', () => {
    const result = applyPreset(base, 'trusted-writes')
    for (const tool of DESTRUCTIVE_TOOLS) {
      expect(result.toolModes[tool]).toBe('ask')
    }
  })

  it('keeps shell-level tools at "deny"', () => {
    const result = applyPreset(base, 'trusted-writes')
    expect(result.toolModes['cli.eval']).toBe('deny')
    expect(result.toolModes['cli.execute']).toBe('deny')
    expect(result.toolModes['cli.run']).toBe('deny')
  })

  it('leaves read tools at "allow" (unchanged from defaults)', () => {
    const result = applyPreset(base, 'trusted-writes')
    expect(result.toolModes['vault.read']).toBe('allow')
    expect(result.toolModes['metadata.tags']).toBe('allow')
  })

  it('does not mutate the input', () => {
    const original = { ...base, toolModes: { ...base.toolModes } }
    const before = JSON.stringify(original.toolModes)
    applyPreset(original, 'trusted-writes')
    expect(JSON.stringify(original.toolModes)).toBe(before)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/application/settings/presets.test.ts`
Expected: FAIL — `SAFE_WRITE_TOOLS`/`DESTRUCTIVE_TOOLS` not exported; `'trusted-writes'` not a valid `Preset`.

- [ ] **Step 3: Implement the constants + preset**

Replace `src/application/settings/presets.ts` with:

```typescript
import {
  DEFAULT_TOOL_MODES,
  type PluginSettings,
  type ToolMode,
} from '@/domain/settings/PluginSettings'

export type Preset = 'all-ask' | 'safe-defaults' | 'all-allow' | 'trusted-writes'

/**
 * Content-mutating tools considered safe to auto-allow: they create or edit
 * notes/metadata but are reversible and non-shell. The "trusted-writes" preset
 * upgrades exactly these from "ask" to "allow".
 */
export const SAFE_WRITE_TOOLS: readonly string[] = Object.freeze([
  'vault.write',
  'vault.createFolder',
  'frontmatter.set',
  'note.patch',
  'tags.rename',
  'canvas.write',
  'bases.create',
  'cli.daily_note',
  'cli.open_file',
  'cli.template_insert',
])

/**
 * Irreversible / relocating tools that always keep their prompt under
 * "trusted-writes". (Shell-level tools cli.eval/execute/run stay "deny" via the
 * defaults and are intentionally NOT listed here.)
 */
export const DESTRUCTIVE_TOOLS: readonly string[] = Object.freeze([
  'vault.delete',
  'vault.move',
  'cli.reload',
])

/**
 * Pure function: returns a new settings object with toolModes updated
 * according to the requested preset. Does not mutate the input.
 */
export function applyPreset(current: PluginSettings, preset: Preset): PluginSettings {
  switch (preset) {
    case 'all-ask': {
      const toolModes: Record<string, ToolMode> = {}
      for (const key of Object.keys(DEFAULT_TOOL_MODES)) {
        toolModes[key] = 'ask'
      }
      return { ...current, toolModes }
    }
    case 'safe-defaults': {
      const toolModes: Record<string, ToolMode> = { ...DEFAULT_TOOL_MODES }
      return { ...current, toolModes }
    }
    case 'all-allow': {
      const toolModes: Record<string, ToolMode> = {}
      for (const key of Object.keys(DEFAULT_TOOL_MODES)) {
        toolModes[key] = 'allow'
      }
      return { ...current, toolModes }
    }
    case 'trusted-writes': {
      const toolModes: Record<string, ToolMode> = { ...DEFAULT_TOOL_MODES }
      for (const tool of SAFE_WRITE_TOOLS) {
        toolModes[tool] = 'allow'
      }
      return { ...current, toolModes }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/application/settings/presets.test.ts`
Expected: PASS — both the original suite and the new `trusted-writes` suite.

- [ ] **Step 5: Commit**

```bash
git add src/application/settings/presets.ts tests/application/settings/presets.test.ts
git commit -m "feat(permissions): add trusted-writes preset

Allow reads + safe writes; keep delete/move/reload prompting and
shell-level tools denied.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Claude Code allowlist merge module

**Files:**
- Create: `src/application/settings/claudeAllowlist.ts`
- Test: `tests/application/settings/claudeAllowlist.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/application/settings/claudeAllowlist.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  toHarnessToolId,
  ALLOWLISTED_TOOLS,
  mergeAllowlist,
} from '@/application/settings/claudeAllowlist'
import { SERVER_KEY } from '@/application/mcp/AutoRegister'

describe('toHarnessToolId', () => {
  it('maps dotted tool ids to the harness mcp__server__tool form', () => {
    expect(toHarnessToolId('vault.write')).toBe(`mcp__${SERVER_KEY}__vault_write`)
    expect(toHarnessToolId('vault.list_recursive')).toBe(`mcp__${SERVER_KEY}__vault_list_recursive`)
    expect(toHarnessToolId('cli.read.find')).toBe(`mcp__${SERVER_KEY}__cli_read_find`)
  })
})

describe('ALLOWLISTED_TOOLS', () => {
  it('includes read tools and safe writes, with no duplicates', () => {
    expect(ALLOWLISTED_TOOLS).toContain('vault.read')
    expect(ALLOWLISTED_TOOLS).toContain('vault.write')
    expect(new Set(ALLOWLISTED_TOOLS).size).toBe(ALLOWLISTED_TOOLS.length)
  })

  it('excludes destructive and shell tools', () => {
    expect(ALLOWLISTED_TOOLS).not.toContain('vault.delete')
    expect(ALLOWLISTED_TOOLS).not.toContain('cli.run')
    expect(ALLOWLISTED_TOOLS).not.toContain('cli.execute')
  })
})

describe('mergeAllowlist', () => {
  const ids = ['mcp__x__a', 'mcp__x__b']

  it('creates permissions.allow when content is null', () => {
    const { json, added } = mergeAllowlist(null, ids)
    expect((json as any).permissions.allow).toEqual(ids)
    expect(added).toEqual(ids)
  })

  it('creates permissions.allow when content is empty string', () => {
    const { json } = mergeAllowlist('   ', ids)
    expect((json as any).permissions.allow).toEqual(ids)
  })

  it('preserves unrelated keys and existing allow entries; no duplicates', () => {
    const existing = JSON.stringify({
      model: 'opus',
      permissions: { allow: ['mcp__x__a', 'Bash(ls)'], deny: ['Bash(rm)'] },
    })
    const { json, added } = mergeAllowlist(existing, ids)
    const j = json as any
    expect(j.model).toBe('opus')
    expect(j.permissions.deny).toEqual(['Bash(rm)'])
    expect(j.permissions.allow).toEqual(['mcp__x__a', 'Bash(ls)', 'mcp__x__b'])
    expect(added).toEqual(['mcp__x__b'])
  })

  it('is idempotent on a second run', () => {
    const first = mergeAllowlist(null, ids)
    const second = mergeAllowlist(JSON.stringify(first.json), ids)
    expect(second.added).toEqual([])
    expect((second.json as any).permissions.allow).toEqual(ids)
  })

  it('throws on invalid JSON', () => {
    expect(() => mergeAllowlist('{ not json', ids)).toThrow()
  })

  it('throws when root is not an object', () => {
    expect(() => mergeAllowlist('[]', ids)).toThrow(/not an object/i)
  })

  it('throws when permissions.allow is a non-array', () => {
    expect(() => mergeAllowlist(JSON.stringify({ permissions: { allow: 'nope' } }), ids)).toThrow(
      /not an array/i,
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/application/settings/claudeAllowlist.test.ts`
Expected: FAIL — `Failed to resolve import "@/application/settings/claudeAllowlist"`.

- [ ] **Step 3: Implement the module**

Create `src/application/settings/claudeAllowlist.ts`:

```typescript
import { DEFAULT_TOOL_MODES } from '@/domain/settings/PluginSettings'
import { SAFE_WRITE_TOOLS } from './presets'
import { SERVER_KEY } from '@/application/mcp/AutoRegister'

/** Map an internal dotted tool id to the Claude Code harness form. */
export function toHarnessToolId(dotted: string): string {
  return `mcp__${SERVER_KEY}__${dotted.replace(/\./g, '_')}`
}

/** Reads (default "allow") + safe writes — the tools we add to the harness allowlist. */
export const ALLOWLISTED_TOOLS: readonly string[] = Object.freeze(
  Array.from(
    new Set<string>([
      ...Object.entries(DEFAULT_TOOL_MODES)
        .filter(([, mode]) => mode === 'allow')
        .map(([tool]) => tool),
      ...SAFE_WRITE_TOOLS,
    ]),
  ),
)

export interface MergeResult {
  json: Record<string, unknown>
  added: string[]
}

/**
 * Merge tool ids into a Claude Code `.claude/settings.json` `permissions.allow`
 * array. Pure. Preserves all other keys and existing entries; never duplicates.
 * Throws (caller surfaces a Notice and aborts the write) on invalid JSON, a
 * non-object root, or a non-array `permissions.allow`.
 */
export function mergeAllowlist(existingText: string | null, toolIds: string[]): MergeResult {
  let root: Record<string, unknown> = {}
  if (existingText !== null && existingText.trim() !== '') {
    const parsed: unknown = JSON.parse(existingText)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('.claude/settings.json root is not an object')
    }
    root = parsed as Record<string, unknown>
  }

  const permsRaw = root['permissions']
  const perms: Record<string, unknown> =
    permsRaw !== null && typeof permsRaw === 'object' && !Array.isArray(permsRaw)
      ? (permsRaw as Record<string, unknown>)
      : {}

  const allowRaw = perms['allow']
  if (allowRaw !== undefined && !Array.isArray(allowRaw)) {
    throw new Error('permissions.allow is not an array')
  }
  const allow: string[] = Array.isArray(allowRaw) ? [...(allowRaw as string[])] : []

  const seen = new Set(allow)
  const added: string[] = []
  for (const id of toolIds) {
    if (!seen.has(id)) {
      allow.push(id)
      seen.add(id)
      added.push(id)
    }
  }

  perms['allow'] = allow
  root['permissions'] = perms
  return { json: root, added }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/application/settings/claudeAllowlist.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/settings/claudeAllowlist.ts tests/application/settings/claudeAllowlist.test.ts
git commit -m "feat(permissions): Claude Code allowlist merge helper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Claude allowlist consent modal

**Files:**
- Create: `src/plugin/modals/ClaudeAllowlistConsentModal.ts`

(UI component — `src/plugin/**` is coverage-excluded; verified by typecheck/build, not unit tests. Mirrors the existing `HookConsentModal` pattern.)

- [ ] **Step 1: Write the modal**

Create `src/plugin/modals/ClaudeAllowlistConsentModal.ts`:

```typescript
import { type App, Modal } from 'obsidian'
import type { FileSystem } from '@/domain/catalog/types'
import { detectSyncedVault } from './HookConsentModal'

/**
 * Confirms before writing the Claude Code allowlist into `.claude/settings.json`.
 * Shows the target path, the tool ids to be added, and a synced-vault warning.
 */
export class ClaudeAllowlistConsentModal extends Modal {
  constructor(
    private readonly fs: FileSystem,
    app: App,
    private readonly targetPath: string,
    private readonly toolIds: string[],
    private readonly onConfirm: () => void,
  ) {
    super(app)
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this
    contentEl.createEl('h3', { text: 'Generate Claude Code allowlist' })
    contentEl.createEl('p', {
      text: `This merges ${this.toolIds.length} read + safe-write tools into ${this.targetPath} so Claude Code stops prompting for them. Existing entries are preserved.`,
    })
    const pre = contentEl.createEl('pre', { text: this.toolIds.join('\n') })
    pre.style.maxHeight = '240px'
    pre.style.overflowY = 'auto'

    const sync = await detectSyncedVault(this.fs)
    if (sync !== null) {
      contentEl.createEl('p', {
        text: `This vault appears to be under ${sync}. Writing .claude/settings.json will propagate to every machine/collaborator that syncs this vault.`,
        cls: 'mod-warning',
      })
    }

    const btnRow = contentEl.createEl('div')
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:8px;'
    const cancelBtn = btnRow.createEl('button', { text: 'Cancel' })
    cancelBtn.addEventListener('click', () => this.close())
    const confirmBtn = btnRow.createEl('button', { text: 'Write allowlist' })
    confirmBtn.classList.add('mod-cta')
    confirmBtn.addEventListener('click', () => {
      this.onConfirm()
      this.close()
    })
  }

  onClose(): void {
    this.contentEl.empty()
  }
}
```

Note: `detectSyncedVault` is already exported from `src/plugin/modals/HookConsentModal.ts` (verified) — import it, do not duplicate.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/plugin/modals/ClaudeAllowlistConsentModal.ts
git commit -m "feat(ui): consent modal for Claude Code allowlist write

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Tabbed settings refactor + wire new controls

**Files:**
- Modify: `src/plugin/settings.ts`
- Modify: `src/plugin/CombinedSettingsTab.ts`

(UI refactor — coverage-excluded. Verified by typecheck/build/lint + manual smoke. No placeholders: full code for new/changed pieces below; existing blocks are *moved verbatim* per the mapping.)

- [ ] **Step 1: Split `renderMcpServerSettings` into three tab renderers**

In `src/plugin/settings.ts`, replace the single exported `renderMcpServerSettings` function with three exported functions. **Move the existing rendering blocks verbatim** into these homes (line ranges refer to the current file):

- `export function renderServerTab(plugin, containerEl, onRefresh)` — move into it, in order:
  - `renderStatusBanner(plugin, containerEl, onRefresh)` call
  - the `h2 'Server'` + Port setting (`:156-178`)
  - Default mode dropdown (`:180-189`) → **move to** `renderPermissionsTab` instead (see below)
  - Ask timeout (`:191-211`) → **move to** `renderPermissionsTab`
  - Log level (`:213-219`)
  - Auto-start toggle (`:221-232`)
  - Obsidian CLI binary path (`:234-270`)
  - Auto-register section (`h2 'Auto-register…'` + the `autoRegisterClients` loop, `:295-329`). **Add a codex entry** to the `autoRegisterClients` array:
    ```typescript
    { id: 'codex', label: 'Codex CLI', desc: '~/.codex/config.toml — opt in if you use Codex CLI.' },
    ```
    (The array element type is `{ id: keyof AutoRegisterSettings; label: string; desc: string }`; `codex` is now a valid key from Task 3.)
- `export function renderPermissionsTab(plugin, containerEl, onRefresh, fs)` — move into it, in order:
  - Default mode dropdown (from `:180-189`)
  - Ask timeout (from `:191-211`) **with the updated description** (Step 2)
  - `h2 'Tool modes'` + `renderPresetButtons(...)` (`:398-402`) — `renderPresetButtons` gets the new button in Step 3
  - the tier legend (Step 4)
  - the per-namespace tool-mode loop (`:404-432`)
  - the "Generate Claude Code allowlist" button (Step 5)
- `export function renderAdvancedTab(plugin, containerEl)` — move into it, in order:
  - Path deny-list (`h2 'Path deny-list'` + textarea, `:272-293`)
  - `cli.execute allowed prefixes` (`:331-345`)
  - `CLI run allow-list` (`:347-376`)
  - `Developer mode` (`:378-395`)

**Delete** the legacy `export class SpecoratorMcpSettingsTab` (`:435-450`) — it is unused (no instantiation, no test reference; verified).

- [ ] **Step 2: Update the ask-timeout description (Permissions tab)**

In the moved ask-timeout `Setting`, replace `.setDesc(...)`:

```typescript
    .setDesc(
      'The in-vault confirmation modal auto-denies after this many seconds with no response. ' +
        'This is separate from the Claude Code approval prompt — see "Generate Claude Code allowlist" below.',
    )
```

- [ ] **Step 3: Add the Trusted-writes preset button**

In `renderPresetButtons` (settings.ts), add a fourth button between "Safe defaults" and "All allow (advanced)":

```typescript
  const trustedBtn = row.createEl('button', { text: 'Trusted writes' })
  trustedBtn.title =
    'Allow reads and safe writes; still prompt for delete/move/reload and keep shell tools denied'
  trustedBtn.onclick = async () => {
    plugin.settings = applyPreset(plugin.settings, 'trusted-writes')
    await plugin.saveSettings()
    onRefresh()
  }
```

(`applyPreset` is already imported at the top of settings.ts.)

- [ ] **Step 4: Add the tier legend (Permissions tab)**

Add this helper to settings.ts and call it in `renderPermissionsTab` right after `renderPresetButtons(...)`:

```typescript
import { SAFE_WRITE_TOOLS, DESTRUCTIVE_TOOLS } from '@/application/settings/presets'

function renderTierLegend(containerEl: HTMLElement): void {
  const legend = containerEl.createEl('div', { cls: 'setting-item-description' })
  legend.style.cssText = 'margin:4px 0 12px;line-height:1.6;'
  const rows: [string, string][] = [
    ['Read', 'Allowed by default — no prompt.'],
    ['Safe write', `Allowed by "Trusted writes": ${SAFE_WRITE_TOOLS.join(', ')}.`],
    ['Destructive', `Always prompts under "Trusted writes": ${DESTRUCTIVE_TOOLS.join(', ')}.`],
    ['Blocked', 'Denied by default: cli.eval, cli.execute, cli.run.'],
  ]
  for (const [tier, desc] of rows) {
    const line = legend.createEl('div')
    line.createEl('strong', { text: `${tier}: ` })
    line.appendText(desc)
  }
}
```

- [ ] **Step 5: Add the "Generate Claude Code allowlist" button (Permissions tab)**

At the end of `renderPermissionsTab`, add (uses the `fs: FileSystem` parameter):

```typescript
import { ALLOWLISTED_TOOLS, toHarnessToolId, mergeAllowlist } from '@/application/settings/claudeAllowlist'
import { ClaudeAllowlistConsentModal } from './modals/ClaudeAllowlistConsentModal'

  // inside renderPermissionsTab, after the tool-mode loop:
  containerEl.createEl('h3', { text: 'Claude Code allowlist' })
  containerEl.createEl('p', {
    cls: 'setting-item-description',
    text: 'Add read + safe-write tools to this vault’s .claude/settings.json so Claude Code stops prompting for them. Destructive tools are left out.',
  })
  new Setting(containerEl)
    .setName('Generate Claude Code allowlist')
    .setDesc('Writes/merges into .claude/settings.json (existing entries preserved).')
    .addButton((b) =>
      b.setButtonText('Generate…').onClick(() => {
        const targetPath = '.claude/settings.json'
        const toolIds = ALLOWLISTED_TOOLS.map(toHarnessToolId)
        new ClaudeAllowlistConsentModal(fs, plugin.app, targetPath, toolIds, () => {
          void (async () => {
            try {
              const existing = await fs.read(targetPath)
              const { json, added } = mergeAllowlist(existing, toolIds)
              await fs.mkdirp('.claude')
              await fs.write(targetPath, JSON.stringify(json, null, 2) + '\n')
              new Notice(
                added.length > 0
                  ? `Added ${added.length} tool(s) to Claude Code allowlist.`
                  : 'Claude Code allowlist already up to date.',
              )
            } catch (err) {
              new Notice(
                `Could not update .claude/settings.json: ${err instanceof Error ? err.message : String(err)}`,
                10000,
              )
            }
          })()
        }).open()
      }),
    )
```

Note: `fs: FileSystem` is `@/domain/catalog/types` (`read`/`write`/`exists`/`mkdirp`). `mkdirp` treats its argument as a **directory** path and creates each missing segment (verified in `catalogFs.ts`), so pass `'.claude'` (the parent dir) — NOT the file path — before writing `.claude/settings.json`.

- [ ] **Step 6: Rewrite `CombinedSettingsTab` as a tab-bar host**

Replace `src/plugin/CombinedSettingsTab.ts` with:

```typescript
import { App, PluginSettingTab } from 'obsidian'
import type SpecoratorMcpPlugin from './main'
import type { FileSystem, CatalogIndex } from '@/domain/catalog/types'
import { renderServerTab, renderPermissionsTab, renderAdvancedTab } from './settings'
import { renderCatalogSettings } from './CatalogSettingsTab'

type TabId = 'server' | 'permissions' | 'catalog' | 'advanced'

const TABS: { id: TabId; label: string }[] = [
  { id: 'server', label: 'Server' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'catalog', label: 'Catalog' },
  { id: 'advanced', label: 'Advanced' },
]

/**
 * Single Obsidian settings entry hosting four tabs: Server, Permissions,
 * Catalog, Advanced. Replaces the former single long scroll.
 */
export class CombinedSettingsTab extends PluginSettingTab {
  private activeTab: TabId = 'server'
  private catalogSearchTerm = ''

  constructor(
    app: App,
    private readonly mcpPlugin: SpecoratorMcpPlugin,
    private readonly fs: FileSystem,
    private readonly catalog: CatalogIndex,
  ) {
    super(app, mcpPlugin)
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    // ── Tab bar ──────────────────────────────────────────────────────────────
    const bar = containerEl.createEl('div', { cls: 'specorator-settings-tabs' })
    bar.style.cssText = 'display:flex;gap:4px;margin-bottom:16px;border-bottom:1px solid var(--background-modifier-border);'
    for (const tab of TABS) {
      const btn = bar.createEl('button', { text: tab.label })
      btn.style.cssText =
        'background:none;border:none;padding:8px 12px;cursor:pointer;border-bottom:2px solid transparent;'
      if (tab.id === this.activeTab) {
        btn.style.borderBottomColor = 'var(--interactive-accent)'
        btn.style.fontWeight = '600'
      }
      btn.onclick = () => {
        this.activeTab = tab.id
        this.display()
      }
    }

    const content = containerEl.createEl('div', { cls: 'specorator-settings-content' })

    switch (this.activeTab) {
      case 'server':
        renderServerTab(this.mcpPlugin, content, () => this.display())
        break
      case 'permissions':
        renderPermissionsTab(this.mcpPlugin, content, () => this.display(), this.fs)
        break
      case 'advanced':
        renderAdvancedTab(this.mcpPlugin, content)
        break
      case 'catalog':
        void renderCatalogSettings(
          this.app,
          this.mcpPlugin,
          this.fs,
          this.catalog,
          content,
          this.catalogSearchTerm,
          (term) => {
            this.catalogSearchTerm = term
          },
          () => this.display(),
        )
        break
    }
  }
}
```

Note: the former status-banner "Jump to Workflow catalog" anchor that used `scrollIntoView` no longer applies (catalog is its own tab); if that anchor was moved into `renderServerTab`, change its click handler to switch tabs — or drop it. Since `renderServerTab` has no access to `activeTab`, simplest is to **remove the jump anchor** from the status banner during the move.

- [ ] **Step 7: Verify build, types, lint, tests**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all PASS. `npm run build` runs `build:catalog` + `tsc --noEmit` + esbuild — confirms the plugin bundles with the refactored UI.

- [ ] **Step 8: Manual smoke test (record result)**

In Obsidian (test vault) with the rebuilt plugin:
1. Open Settings → Specorator → confirm four tabs (Server / Permissions / Catalog / Advanced) and that clicking switches content.
2. Permissions tab → click **Trusted writes** → reopen → confirm `vault.write` dropdown shows `allow`, `vault.delete` shows `ask`.
3. Permissions tab → **Generate Claude Code allowlist** → confirm consent modal lists tools → confirm → check `.claude/settings.json` in the vault has `permissions.allow` with `mcp__specorator-obsidian-mcp__vault_read` etc.
4. Server tab → enable **Codex CLI** toggle → restart MCP server → check `~/.codex/config.toml` contains `[mcp_servers.specorator-obsidian-mcp]` with the `url`; confirm any pre-existing content/comments survive.
5. Disable the toggle / stop server → confirm the block is removed and other tables remain.

Record pass/fail for each in the execution notes.

- [ ] **Step 9: Commit**

```bash
git add src/plugin/settings.ts src/plugin/CombinedSettingsTab.ts
git commit -m "feat(ui): tabbed settings + trusted-writes button, tier legend, allowlist generator, codex toggle

Splits settings into Server/Permissions/Catalog/Advanced tabs, retires the
unused SpecoratorMcpSettingsTab, clarifies ask-timeout copy, and surfaces the
new permission controls.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

- [ ] **Run the full gate**

Run: `npm run verify`
Expected: lint + format:check + test + build + validate:manifest + audit all PASS. (If `format:check` fails, run `npm run format` and amend the last commit.)

---

## Self-Review (completed during planning)

**Spec coverage:**
- Part A (tabs) → Task 7 ✓
- Part B (trusted-writes preset + tier legend + ask-timeout copy) → Tasks 4, 7 ✓
- Part C (allowlist generator: pure merge + consent modal + button; drop manifest `permissions.suggested`) → Tasks 5, 6, 7 ✓ (manifest field intentionally omitted, per spec)
- Part D (Codex auto-register: TOML splice + format dispatch + setting + toggle + deep-merge migration) → Tasks 1, 2, 3, 7 ✓ (migration is free via existing `loadSettings` spread, noted in Task 3)

**Type consistency:** `SAFE_WRITE_TOOLS` / `DESTRUCTIVE_TOOLS` defined in Task 4, consumed in Tasks 5 & 7. `toHarnessToolId` / `ALLOWLISTED_TOOLS` / `mergeAllowlist` defined Task 5, consumed Task 7. `format` field + `codex` id defined Task 2, key added Task 3, toggle wired Task 7. `renderServerTab` / `renderPermissionsTab(…, fs)` / `renderAdvancedTab` signatures consistent between Task 7 Step 1 and the `CombinedSettingsTab` calls in Step 6. `detectSyncedVault` reused from `HookConsentModal` (verified exported).

**Placeholder scan:** none — all code steps contain full code; moved blocks reference exact line ranges + destination.
