import type { AssetMeta, AssetType, Platform } from '@/domain/catalog/types'

type Table = Record<Platform, Partial<Record<AssetType, (id: string) => string>>>

const TABLE: Table = {
  claude: {
    skill: (id) => `.claude/skills/${id}/SKILL.md`,
    command: (id) => `.claude/commands/${id}.md`,
    agent: (id) => `.claude/agents/${id}.md`,
    // Decision 6: hooks always merge into the platform's shared hooks.json
    // (Phase 3 owns the merge). Never a per-id <id>.json.
    hook: (_id) => `.claude/hooks/hooks.json`,
  },
  cursor: {
    skill: (id) => `.cursor/skills/${id}/SKILL.md`,
    command: (id) => `.cursor/commands/${id}.md`,
    agent: (id) => `.cursor/agents/${id}.md`, // H7: agents on Claude + Cursor only
  },
  codex: {
    skill: (id) => `.agents/skills/${id}/SKILL.md`, // NOT .codex/
    // B5: Codex commands are GLOBAL prompts (~/.codex/prompts or $CODEX_HOME),
    // not vault-local. We do not emit Codex commands in v1 — no mapping here.
    // H7: no Codex agent path (AGENTS.md is an append-merge, out of scope for v1).
  },
  gemini: {
    skill: (id) => `.gemini/extensions/specorator/skills/${id}/SKILL.md`,
    // R4: commands MUST live under the extension dir so the registered extension
    // discovers them; a loose `.gemini/commands/` is a separate project command.
    command: (id) => `.gemini/extensions/specorator/commands/${id}.toml`,
    // B6: Gemini also needs a gemini-extension.json manifest (see Task 7b) so the
    // extension dir is actually registered. The manifest is not a per-asset path.
    // H7: no Gemini agent path (GEMINI.md is an append-merge, out of scope for v1).
    // NOTE: no Gemini `hook` mapping — Phase 3 only merges Claude hooks
    // (`HOOKS_PATH`), so a Gemini hook path would be dead code. Hooks are
    // Claude-only in v1.
  },
}

export function targetPath(asset: AssetMeta, platform: Platform): string {
  const fn = TABLE[platform][asset.type]
  if (!fn) throw new Error(`no mapping for ${asset.type} on ${platform}`)
  return fn(asset.id)
}

export function supportedPlatforms(asset: AssetMeta): Platform[] {
  return (Object.keys(TABLE) as Platform[]).filter((p) => {
    const row = TABLE[p]
    return row[asset.type] !== undefined
  })
}
