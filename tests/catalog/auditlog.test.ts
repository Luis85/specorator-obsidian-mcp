import { describe, it, expect } from 'vitest'
import { appendAudit, rotateIfNeeded, AUDIT_PATH } from '@/application/catalog/auditlog'
import { memFs } from './memfs'

describe('auditlog', () => {
  it('appends a JSONL entry', async () => {
    const fs = memFs()
    await appendAudit(fs, { kind: 'install', action: 'enable', id: 'x', hash: 'h' })
    await appendAudit(fs, { kind: 'install', action: 'disable', id: 'x', hash: 'h' })
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
      kind: 'install' as const,
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

describe('rotateIfNeeded', () => {
  it('no-ops when file is absent', async () => {
    const fs = memFs()
    await rotateIfNeeded(fs, AUDIT_PATH, 100)
    expect(await fs.read(AUDIT_PATH)).toBeNull()
  })

  it('no-ops when file is below the threshold', async () => {
    const fs = memFs()
    const small = JSON.stringify({ kind: 'install', action: 'enable', id: 'x', hash: 'h' }) + '\n'
    await fs.write(AUDIT_PATH, small)
    await rotateIfNeeded(fs, AUDIT_PATH, 10_000)
    expect(await fs.read(AUDIT_PATH)).toBe(small)
  })

  it('drops oldest 20% of lines and writes a rotation entry when over threshold', async () => {
    const fs = memFs()
    // Build content > threshold: 100 lines, each ~60 bytes = ~6000 bytes
    const lines = Array.from({ length: 100 }, (_, i) =>
      JSON.stringify({ kind: 'install', action: 'enable', id: `asset-${i}`, hash: 'h'.repeat(40) }),
    )
    await fs.write(AUDIT_PATH, lines.join('\n') + '\n')
    const before = (await fs.read(AUDIT_PATH))!.length
    expect(before).toBeGreaterThan(5000)
    await rotateIfNeeded(fs, AUDIT_PATH, 5000)
    const after = await fs.read(AUDIT_PATH)
    expect(after).not.toBeNull()
    // Should have dropped 20 lines (20%) and added a rotation entry
    const remaining = after!.trim().split('\n').filter(Boolean)
    // 80 kept + 1 rotation entry = 81
    expect(remaining.length).toBe(81)
    const rotEntry = JSON.parse(remaining[remaining.length - 1])
    expect(rotEntry.kind).toBe('rotation')
    expect(rotEntry.removed).toBe(20)
    expect(typeof rotEntry.ts).toBe('string')
    // Oldest 20 lines (asset-0..asset-19) should be gone
    const ids = remaining.slice(0, -1).map((l) => JSON.parse(l).id as string)
    expect(ids).not.toContain('asset-0')
    expect(ids).toContain('asset-20')
  })

  it('appendAudit triggers rotation when content exceeds 5MB', async () => {
    const fs = memFs()
    // Seed the file with 6MB of data (6000 lines of ~1000 chars each)
    const bigLine = 'x'.repeat(999) + '\n'
    const content = bigLine.repeat(6000)
    await fs.write(AUDIT_PATH, content)
    await fs.mkdirp('.specorator')

    await appendAudit(fs, { kind: 'install', action: 'enable', id: 'trigger', hash: 'h' })

    const after = await fs.read(AUDIT_PATH)
    expect(after).not.toBeNull()
    expect(after!.length).toBeLessThan(content.length)
    // The rotation entry must be present
    const allLines = after!.trim().split('\n').filter(Boolean)
    const rotationLines = allLines.filter((l) => {
      try {
        return JSON.parse(l).kind === 'rotation'
      } catch {
        return false
      }
    })
    expect(rotationLines.length).toBeGreaterThan(0)
  })
})
