import { describe, it, expect } from 'vitest'
import { resolveOrder } from '@/application/catalog/deps'
import type { AssetMeta } from '@/domain/catalog/types'

const idx = (deps: Record<string, string[]>): AssetMeta[] =>
  Object.entries(deps).map(([id, dependsOn]) => ({ id, dependsOn }) as unknown as AssetMeta)

describe('resolveOrder', () => {
  it('returns deps before dependents', () => {
    const order = resolveOrder('a', idx({ a: ['b'], b: ['c'], c: [] }))
    expect(order).toEqual(['c', 'b', 'a'])
  })
  it('throws on a cycle', () => {
    expect(() => resolveOrder('a', idx({ a: ['b'], b: ['a'] }))).toThrow(/cycle/i)
  })
  it('throws on a missing dependency', () => {
    expect(() => resolveOrder('a', idx({ a: ['z'] }))).toThrow(/missing/i)
  })
})
