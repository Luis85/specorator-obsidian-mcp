import { describe, it, expect } from 'vitest'
import { CANONICAL_TOOL_NAMES, isKnownTool } from '@/application/mcp/ToolModeRegistry'

describe('ToolModeRegistry', () => {
  it('contains all 33 tools', () => {
    expect(CANONICAL_TOOL_NAMES).toHaveLength(33)
  })

  it('includes vault.write, cli.execute, cli.run and cli.eval', () => {
    expect(CANONICAL_TOOL_NAMES).toContain('vault.write')
    expect(CANONICAL_TOOL_NAMES).toContain('cli.execute')
    expect(CANONICAL_TOOL_NAMES).toContain('cli.run')
    expect(CANONICAL_TOOL_NAMES).toContain('cli.eval')
  })

  it('isKnownTool true for known', () => {
    expect(isKnownTool('vault.write')).toBe(true)
  })

  it('isKnownTool false for unknown', () => {
    expect(isKnownTool('fake.tool')).toBe(false)
  })
})
