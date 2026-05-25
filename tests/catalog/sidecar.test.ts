import { describe, it, expect } from 'vitest'
import { loadState, saveRecord, removeRecord, SIDECAR_PATH } from '@/application/catalog/sidecar'
import { memFs } from './memfs'

describe('sidecar', () => {
  it('returns empty state when sidecar is absent', async () => {
    expect(await loadState(memFs())).toEqual({})
  })
  it('round-trips a record', async () => {
    const fs = memFs()
    await saveRecord(fs, 'auditing-vault', {
      version: '0.1.0',
      platforms: ['claude'],
      paths: ['.claude/skills/auditing-vault/SKILL.md'],
      hash: 'abc',
    })
    expect(await loadState(fs)).toHaveProperty('auditing-vault')
    expect(JSON.parse(fs.dump()[SIDECAR_PATH])['auditing-vault'].hash).toBe('abc')
  })
  it('removes a record', async () => {
    const fs = memFs()
    await saveRecord(fs, 'x', { version: '1', platforms: ['claude'], paths: [], hash: 'h' })
    await removeRecord(fs, 'x')
    expect(await loadState(fs)).toEqual({})
  })
})
