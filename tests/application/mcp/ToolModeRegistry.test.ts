import { describe, it, expect } from 'vitest'
import { CANONICAL_TOOL_NAMES, isKnownTool } from '@/application/mcp/ToolModeRegistry'

describe('ToolModeRegistry', () => {
  it('contains all 25 tools', () => {
    expect(CANONICAL_TOOL_NAMES).toHaveLength(25)
  })

  it('includes vault.write and cli.execute', () => {
    expect(CANONICAL_TOOL_NAMES).toContain('vault.write')
    expect(CANONICAL_TOOL_NAMES).toContain('cli.execute')
  })

  it('isKnownTool true for known', () => {
    expect(isKnownTool('vault.write')).toBe(true)
  })

  it('isKnownTool false for unknown', () => {
    expect(isKnownTool('fake.tool')).toBe(false)
  })
})
