import { describe, it, expect } from 'vitest'
import { mergeHook, unmergeHook, HOOKS_PATH } from '@/application/catalog/hooks'
import { memFs } from './memfs'

const frag = {
  id: 'session-audit',
  event: 'SessionStart',
  entry: { matcher: '*', command: 'echo audit' },
}

describe('hooks merge', () => {
  it('creates the hooks file and adds the entry', async () => {
    const fs = memFs()
    await mergeHook(fs, '.claude/hooks/hooks.json', frag)
    const json = JSON.parse((await fs.read('.claude/hooks/hooks.json'))!)
    expect(json.SessionStart[0].command).toBe('echo audit')
    expect(json.SessionStart[0]._specorator).toBe('session-audit')
  })
  // R3: writeBackup produces a TIMESTAMPED .bak (`hooks.json.<ISO>.bak`), so assert
  // on the .bak suffix, not a fixed `hooks.json.bak` name (which never exists).
  it('backs up the original (timestamped .bak) before writing', async () => {
    const fs = memFs({ '.claude/hooks/hooks.json': '{"SessionStart":[]}' })
    await mergeHook(fs, '.claude/hooks/hooks.json', frag)
    const baks = Object.keys(fs.dump()).filter(
      (k) => k.startsWith('.claude/hooks/hooks.json.') && k.endsWith('.bak'),
    )
    expect(baks.length).toBe(1)
  })
  it('unmerge removes only our tagged entry and backs up first', async () => {
    const fs = memFs()
    await mergeHook(fs, '.claude/hooks/hooks.json', frag)
    await unmergeHook(fs, '.claude/hooks/hooks.json', 'session-audit')
    const json = JSON.parse((await fs.read('.claude/hooks/hooks.json'))!)
    expect(json.SessionStart).toEqual([])
    // normal unmerge backs up before rewriting — timestamped .bak (R3)
    const baks = Object.keys(fs.dump()).filter(
      (k) => k.startsWith('.claude/hooks/hooks.json.') && k.endsWith('.bak'),
    )
    expect(baks.length).toBeGreaterThanOrEqual(1)
  })
  it('unmerge is a no-op when the hooks file is absent (no empty file written)', async () => {
    const fs = memFs()
    await unmergeHook(fs, '.claude/hooks/hooks.json', 'session-audit')
    expect(await fs.exists('.claude/hooks/hooks.json')).toBe(false)
    expect(await fs.exists('.claude/hooks/hooks.json.bak')).toBe(false)
  })
  it('unmerge aborts on a malformed existing file and preserves the original', async () => {
    const original = '{ this is : not valid json'
    const fs = memFs({ '.claude/hooks/hooks.json': original })
    await expect(unmergeHook(fs, '.claude/hooks/hooks.json', 'session-audit')).rejects.toThrow(
      /parse|JSON/i,
    )
    // original untouched, and we did NOT overwrite it with {}
    expect(await fs.read('.claude/hooks/hooks.json')).toBe(original)
  })
})

// Ensure HOOKS_PATH constant is exported and correct
describe('HOOKS_PATH', () => {
  it('is the canonical platform hooks file path', () => {
    expect(HOOKS_PATH).toBe('.claude/hooks/hooks.json')
  })
})
