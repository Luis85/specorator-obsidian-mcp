import { describe, it, expect } from 'vitest'
import { CANONICAL_TOOL_NAMES, isKnownTool } from '@/application/mcp/ToolModeRegistry'

describe('ToolModeRegistry', () => {
  it('contains all 52 tools', () => {
    expect(CANONICAL_TOOL_NAMES).toHaveLength(52)
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

  it('includes Phase-3 remediation and patch tools', () => {
    expect(CANONICAL_TOOL_NAMES).toContain('note.patch')
    expect(CANONICAL_TOOL_NAMES).toContain('vault.hash')
    expect(CANONICAL_TOOL_NAMES).toContain('tags.rename')
    expect(CANONICAL_TOOL_NAMES).toContain('attachments.orphans')
    expect(CANONICAL_TOOL_NAMES).toContain('audit.export')
  })

  it('includes WS-A3 diagnostic tools', () => {
    expect(CANONICAL_TOOL_NAMES).toContain('audit.tail')
    expect(CANONICAL_TOOL_NAMES).toContain('audit.diff')
    expect(CANONICAL_TOOL_NAMES).toContain('vault.stats')
  })

  it('isKnownTool true for known', () => {
    expect(isKnownTool('vault.write')).toBe(true)
  })

  it('isKnownTool false for unknown', () => {
    expect(isKnownTool('fake.tool')).toBe(false)
  })
})
