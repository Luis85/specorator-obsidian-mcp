import { describe, it, expect } from 'vitest'
import { appendAudit, AUDIT_PATH } from '@/application/catalog/auditlog'
import { memFs } from './memfs'

describe('auditlog', () => {
  it('appends a JSONL entry', async () => {
    const fs = memFs()
    await appendAudit(fs, { action: 'enable', id: 'x', hash: 'h' })
    await appendAudit(fs, { action: 'disable', id: 'x', hash: 'h' })
    const lines = (await fs.read(AUDIT_PATH))!.trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]).action).toBe('enable')
    expect(JSON.parse(lines[1]).action).toBe('disable')
    expect(JSON.parse(lines[0]).ts).toBeTypeOf('string')
  })
})
