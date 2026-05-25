import { describe, it, expect } from 'vitest'
import { decideAction } from '@/application/catalog/conflict'

describe('decideAction', () => {
  it('write when no existing file', () => {
    expect(decideAction({ exists: false, tracked: false, hashMatches: false })).toBe('write')
  })
  it('conflict when untracked file exists', () => {
    expect(decideAction({ exists: true, tracked: false, hashMatches: false })).toBe('conflict')
  })
  it('safe-overwrite when tracked and hash matches', () => {
    expect(decideAction({ exists: true, tracked: true, hashMatches: true })).toBe('safe-overwrite')
  })
  it('user-modified when tracked but hash differs', () => {
    expect(decideAction({ exists: true, tracked: true, hashMatches: false })).toBe('user-modified')
  })
})
