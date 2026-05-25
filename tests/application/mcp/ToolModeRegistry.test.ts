import { describe, it, expect } from 'vitest'
import { CANONICAL_TOOL_NAMES, isKnownTool } from '@/application/mcp/ToolModeRegistry'

describe('ToolModeRegistry', () => {
  it('contains all 44 tools', () => {
    expect(CANONICAL_TOOL_NAMES).toHaveLength(44)
  })

  it('includes vault.write, cli.execute, cli.run and cli.eval', () => {
    expect(CANONICAL_TOOL_NAMES).toContain('vault.write')
    expect(CANONICAL_TOOL_NAMES).toContain('cli.execute')
    expect(CANONICAL_TOOL_NAMES).toContain('cli.run')
    expect(CANONICAL_TOOL_NAMES).toContain('cli.eval')
  })

  it('includes new Phase-2 graph and query tools', () => {
    expect(CANONICAL_TOOL_NAMES).toContain('graph.stats')
    expect(CANONICAL_TOOL_NAMES).toContain('graph.orphans')
    expect(CANONICAL_TOOL_NAMES).toContain('graph.deadends')
    expect(CANONICAL_TOOL_NAMES).toContain('frontmatter.query')
    expect(CANONICAL_TOOL_NAMES).toContain('vault.walk')
  })

  it('isKnownTool true for known', () => {
    expect(isKnownTool('vault.write')).toBe(true)
  })

  it('isKnownTool false for unknown', () => {
    expect(isKnownTool('fake.tool')).toBe(false)
  })
})
