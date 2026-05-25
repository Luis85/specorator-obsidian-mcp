import { describe, it, expect } from 'vitest'
import { targetPath } from '@/application/catalog/platforms'
import type { AssetMeta } from '@/domain/catalog/types'

const a = (type: string) => ({ id: 'x', type }) as AssetMeta

describe('targetPath (all platforms)', () => {
  it('claude skill/command/agent/hook', () => {
    expect(targetPath(a('skill'), 'claude')).toBe('.claude/skills/x/SKILL.md')
    expect(targetPath(a('command'), 'claude')).toBe('.claude/commands/x.md')
    expect(targetPath(a('agent'), 'claude')).toBe('.claude/agents/x.md')
    // Hooks always live in the platform's shared hooks.json (Decision 6),
    // never a per-id <id>.json. Phase 3 owns the merge into this file.
    expect(targetPath(a('hook'), 'claude')).toBe('.claude/hooks/hooks.json')
  })
  it('codex skill goes to .agents/skills (NOT .codex)', () => {
    expect(targetPath(a('skill'), 'codex')).toBe('.agents/skills/x/SKILL.md')
  })
  it('codex has NO project-local command path (Codex reads ~/.codex/prompts, global)', () => {
    // B5: Codex prompts are GLOBAL (~/.codex/prompts or $CODEX_HOME), not vault-local.
    // We therefore do not emit Codex commands in v1.
    expect(() => targetPath(a('command'), 'codex')).toThrow(/no mapping/)
  })
  it('cursor skill + command', () => {
    expect(targetPath(a('skill'), 'cursor')).toBe('.cursor/skills/x/SKILL.md')
    expect(targetPath(a('command'), 'cursor')).toBe('.cursor/commands/x.md')
  })
  it('gemini command is TOML under the extension dir (R4)', () => {
    expect(targetPath(a('command'), 'gemini')).toBe('.gemini/extensions/specorator/commands/x.toml')
  })
  it('agents are scoped to Claude + Cursor only (H7)', () => {
    // H7: Codex AGENTS.md / Gemini GEMINI.md are append-merge files, not
    // file-per-agent. We scope agents to Claude + Cursor for v1.
    expect(targetPath(a('agent'), 'cursor')).toBe('.cursor/agents/x.md')
    expect(() => targetPath(a('agent'), 'codex')).toThrow(/no mapping/)
    expect(() => targetPath(a('agent'), 'gemini')).toThrow(/no mapping/)
  })
})
