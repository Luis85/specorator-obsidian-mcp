import { describe, it, expect } from 'vitest'
import { computeBadge, DEFAULT_PLATFORMS } from '@/plugin/CatalogSettingsTab'

describe('computeBadge', () => {
  it('enabled when installed and up to date', () => {
    expect(computeBadge({ installed: true, requiresOk: true })).toBe('Enabled')
  })
  it("'Update available' when installed but the catalog version is newer", () => {
    expect(
      computeBadge({
        installed: true,
        requiresOk: true,
        installedHash: 'old',
        catalogHash: 'new',
      }),
    ).toBe('Update available')
  })
  it("'Conflict' when an untracked file occupies a target path", () => {
    expect(computeBadge({ installed: false, requiresOk: true, conflict: true })).toBe('Conflict')
  })
  it('degraded when a required tool is missing', () => {
    expect(computeBadge({ installed: false, requiresOk: false })).toBe('Needs tool')
  })
  it("'Needs tool (denied)' when a required tool is present but deny-moded (v0.1.0)", () => {
    expect(computeBadge({ installed: false, requiresOk: false, denied: true })).toBe(
      'Needs tool (denied)',
    )
  })
  it('available otherwise', () => {
    expect(computeBadge({ installed: false, requiresOk: true })).toBe('Available')
  })
})

describe('DEFAULT_PLATFORMS (B7)', () => {
  it('defaults to claude so the engine is reachable out of the box', () => {
    expect(DEFAULT_PLATFORMS).toContain('claude')
  })
})
