import { describe, it, expect } from 'vitest'
import { ok, err, isOk, isErr } from '@/domain/shared/Result'

describe('Result', () => {
  it('ok wraps value', () => {
    const r = ok(42)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe(42)
  })

  it('err wraps error', () => {
    const e = new Error('boom')
    const r = err(e)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe(e)
  })

  it('isOk / isErr narrow correctly', () => {
    const r = ok('hi') as ReturnType<typeof ok> | ReturnType<typeof err>
    expect(isOk(r)).toBe(true)
    expect(isErr(r)).toBe(false)
  })
})
