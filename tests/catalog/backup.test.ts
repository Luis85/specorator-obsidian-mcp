import { describe, it, expect } from 'vitest'
import { backupPathFor, writeBackup } from '@/application/catalog/backup'
import { memFs } from './memfs'

describe('backup', () => {
  it('derives a timestamped .bak path (no clobber on repeat)', () => {
    const ts = '2026-05-25T12-00-00-000Z'
    expect(backupPathFor('.claude/skills/x/SKILL.md', ts)).toBe(
      '.claude/skills/x/SKILL.md.2026-05-25T12-00-00-000Z.bak',
    )
  })
  it('copies existing content to the backup path and returns it', async () => {
    const fs = memFs({ 'a.md': 'ORIGINAL' })
    const bak = await writeBackup(fs, 'a.md')
    expect(bak).not.toBeNull()
    expect(await fs.read(bak!)).toBe('ORIGINAL')
    expect(bak!.endsWith('.bak')).toBe(true)
  })
  it('does not overwrite an earlier backup (distinct timestamps)', async () => {
    const fs = memFs({ 'a.md': 'V1' })
    const b1 = await writeBackup(fs, 'a.md', '2026-05-25T12-00-00-000Z')
    await fs.write('a.md', 'V2')
    const b2 = await writeBackup(fs, 'a.md', '2026-05-25T12-00-01-000Z')
    expect(b1).not.toBe(b2)
    expect(await fs.read(b1!)).toBe('V1')
    expect(await fs.read(b2!)).toBe('V2')
  })
  it('is a no-op when the source is absent', async () => {
    const fs = memFs()
    const bak = await writeBackup(fs, 'missing.md')
    expect(bak).toBeNull()
  })
})
