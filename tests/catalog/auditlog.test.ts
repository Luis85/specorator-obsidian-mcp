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

  // WS-Z2 Fix 5: concurrent appendAudit calls must not lose entries.
  // The old read-modify-write pattern would race; the new fs.append path avoids it.
  it('retains all entries under simulated concurrent calls', async () => {
    const fs = memFs()
    // Fire N appends concurrently — all must appear in the final log.
    const N = 10
    const entries = Array.from({ length: N }, (_, i) => ({
      action: 'enable' as const,
      id: `asset-${i}`,
      hash: `hash-${i}`,
    }))
    await Promise.all(entries.map((e) => appendAudit(fs, e)))
    const raw = (await fs.read(AUDIT_PATH))!
    const lines = raw.trim().split('\n').filter(Boolean)
    expect(lines).toHaveLength(N)
    const ids = lines.map((l) => JSON.parse(l).id as string)
    // Every asset id must appear exactly once
    for (let i = 0; i < N; i++) {
      expect(ids).toContain(`asset-${i}`)
    }
  })
})
