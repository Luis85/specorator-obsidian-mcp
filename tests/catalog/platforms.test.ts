import { describe, it, expect } from 'vitest'
import { targetPath } from '@/application/catalog/platforms'
import type { AssetMeta } from '@/domain/catalog/types'

const partial = (fields: Pick<AssetMeta, 'id' | 'type'>): AssetMeta =>
  fields as unknown as AssetMeta

describe('targetPath', () => {
  it('maps a skill to .claude/skills/<id>/SKILL.md', () => {
    expect(targetPath(partial({ id: 'auditing-vault', type: 'skill' }), 'claude')).toBe(
      '.claude/skills/auditing-vault/SKILL.md',
    )
  })
  it('throws for unsupported type+platform combination', () => {
    // hook on cursor — no mapping defined for that combo
    expect(() => targetPath(partial({ id: 'x', type: 'hook' }), 'cursor')).toThrow(/no mapping/)
  })
  it('throws for unsupported platform (codex has no command mapping)', () => {
    expect(() => targetPath(partial({ id: 'x', type: 'command' }), 'codex')).toThrow(/no mapping/)
  })
})
