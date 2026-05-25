import { describe, it, expect } from 'vitest'
import { sha256 } from '@/application/catalog/hash'

describe('sha256', () => {
  it('is stable for the same input', async () => {
    expect(await sha256('hello')).toBe(await sha256('hello'))
  })
  it('differs for different input', async () => {
    expect(await sha256('a')).not.toBe(await sha256('b'))
  })
  it('matches a known vector', async () => {
    // sha256("abc")
    expect(await sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})
