/**
 * WS-A4 Fix 4: Port range validation.
 *
 * The settings UI and autoStart guard both reject ports outside 1–65535.
 * This test validates the boundary check logic in isolation so we don't need
 * to spin up Obsidian's plugin lifecycle.
 */
import { describe, it, expect } from 'vitest'

/** Mirrors the guard in settings.ts onChange and main.ts autoStart. */
function isValidPort(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 65535
}

describe('port range validation', () => {
  it('accepts the default port 7842', () => {
    expect(isValidPort(7842)).toBe(true)
  })

  it('accepts boundary low (1)', () => {
    expect(isValidPort(1)).toBe(true)
  })

  it('accepts boundary high (65535)', () => {
    expect(isValidPort(65535)).toBe(true)
  })

  it('rejects 0', () => {
    expect(isValidPort(0)).toBe(false)
  })

  it('rejects negative port', () => {
    expect(isValidPort(-1)).toBe(false)
  })

  it('rejects 65536', () => {
    expect(isValidPort(65536)).toBe(false)
  })

  it('rejects 99999', () => {
    expect(isValidPort(99999)).toBe(false)
  })

  it('rejects non-integer', () => {
    expect(isValidPort(3000.5)).toBe(false)
  })
})
