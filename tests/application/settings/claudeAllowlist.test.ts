import { describe, it, expect } from 'vitest'
import {
  toHarnessToolId,
  ALLOWLISTED_TOOLS,
  mergeAllowlist,
} from '@/application/settings/claudeAllowlist'
import { SERVER_KEY } from '@/application/mcp/AutoRegister'

describe('toHarnessToolId', () => {
  it('maps dotted tool ids to the harness mcp__server__tool form', () => {
    expect(toHarnessToolId('vault.write')).toBe(`mcp__${SERVER_KEY}__vault_write`)
    expect(toHarnessToolId('vault.list_recursive')).toBe(`mcp__${SERVER_KEY}__vault_list_recursive`)
    expect(toHarnessToolId('cli.read.find')).toBe(`mcp__${SERVER_KEY}__cli_read_find`)
  })
})

describe('ALLOWLISTED_TOOLS', () => {
  it('includes read tools and safe writes, with no duplicates', () => {
    expect(ALLOWLISTED_TOOLS).toContain('vault.read')
    expect(ALLOWLISTED_TOOLS).toContain('vault.write')
    expect(new Set(ALLOWLISTED_TOOLS).size).toBe(ALLOWLISTED_TOOLS.length)
  })

  it('excludes destructive and shell tools', () => {
    expect(ALLOWLISTED_TOOLS).not.toContain('vault.delete')
    expect(ALLOWLISTED_TOOLS).not.toContain('cli.run')
    expect(ALLOWLISTED_TOOLS).not.toContain('cli.execute')
  })
})

describe('mergeAllowlist', () => {
  const ids = ['mcp__x__a', 'mcp__x__b']

  it('creates permissions.allow when content is null', () => {
    const { json, added } = mergeAllowlist(null, ids)
    expect((json as any).permissions.allow).toEqual(ids)
    expect(added).toEqual(ids)
  })

  it('creates permissions.allow when content is empty string', () => {
    const { json } = mergeAllowlist('   ', ids)
    expect((json as any).permissions.allow).toEqual(ids)
  })

  it('preserves unrelated keys and existing allow entries; no duplicates', () => {
    const existing = JSON.stringify({
      model: 'opus',
      permissions: { allow: ['mcp__x__a', 'Bash(ls)'], deny: ['Bash(rm)'] },
    })
    const { json, added } = mergeAllowlist(existing, ids)
    const j = json as any
    expect(j.model).toBe('opus')
    expect(j.permissions.deny).toEqual(['Bash(rm)'])
    expect(j.permissions.allow).toEqual(['mcp__x__a', 'Bash(ls)', 'mcp__x__b'])
    expect(added).toEqual(['mcp__x__b'])
  })

  it('is idempotent on a second run', () => {
    const first = mergeAllowlist(null, ids)
    const second = mergeAllowlist(JSON.stringify(first.json), ids)
    expect(second.added).toEqual([])
    expect((second.json as any).permissions.allow).toEqual(ids)
  })

  it('throws on invalid JSON', () => {
    expect(() => mergeAllowlist('{ not json', ids)).toThrow()
  })

  it('throws when root is not an object', () => {
    expect(() => mergeAllowlist('[]', ids)).toThrow(/not an object/i)
  })

  it('throws when permissions.allow is a non-array', () => {
    expect(() => mergeAllowlist(JSON.stringify({ permissions: { allow: 'nope' } }), ids)).toThrow(
      /not an array/i,
    )
  })
})
