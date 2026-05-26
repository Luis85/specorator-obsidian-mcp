import { describe, it, expect } from 'vitest'
import {
  upsertTomlBlock,
  removeTomlBlock,
  readTomlBlockUrl,
  hasTomlBlock,
} from '@/application/mcp/tomlBlock'

const HEADER = 'mcp_servers.specorator-obsidian-mcp'
const URL = 'http://127.0.0.1:7842/mcp'

describe('upsertTomlBlock', () => {
  it('appends a block to empty content', () => {
    const out = upsertTomlBlock('', HEADER, [`url = "${URL}"`])
    expect(out).toBe(`[${HEADER}]\nurl = "${URL}"\n`)
  })

  it('appends after existing content, preserving comments and other tables', () => {
    const existing = `# my config\nmodel = "o3"\n\n[mcp_servers.other]\nurl = "http://other/mcp"\n`
    const out = upsertTomlBlock(existing, HEADER, [`url = "${URL}"`])
    expect(out).toContain('# my config')
    expect(out).toContain('model = "o3"')
    expect(out).toContain('[mcp_servers.other]')
    expect(out).toContain(`[${HEADER}]\nurl = "${URL}"`)
  })

  it('replaces an existing block in place when the url changed', () => {
    const existing = `[${HEADER}]\nurl = "http://old/mcp"\n\n[other]\nx = 1\n`
    const out = upsertTomlBlock(existing, HEADER, [`url = "${URL}"`])
    expect(out).toContain(`url = "${URL}"`)
    expect(out).not.toContain('http://old/mcp')
    expect(out).toContain('[other]')
    expect(out).toContain('x = 1')
  })

  it('handles a hyphenated bare-key header', () => {
    const out = upsertTomlBlock('', HEADER, [`url = "${URL}"`])
    expect(out.startsWith(`[${HEADER}]`)).toBe(true)
  })
})

describe('readTomlBlockUrl', () => {
  it('reads the url within our block only', () => {
    const content = `[other]\nurl = "http://wrong/mcp"\n\n[${HEADER}]\nurl = "${URL}"\n`
    expect(readTomlBlockUrl(content, HEADER)).toBe(URL)
  })

  it('returns null when our block is absent', () => {
    expect(readTomlBlockUrl(`[other]\nurl = "x"\n`, HEADER)).toBeNull()
  })
})

describe('hasTomlBlock', () => {
  it('detects presence of our header', () => {
    expect(hasTomlBlock(`[${HEADER}]\nurl = "${URL}"\n`, HEADER)).toBe(true)
    expect(hasTomlBlock(`[other]\n`, HEADER)).toBe(false)
  })
})

describe('removeTomlBlock', () => {
  it('removes our block and keeps other tables', () => {
    const existing = `[${HEADER}]\nurl = "${URL}"\n\n[other]\nx = 1\n`
    const out = removeTomlBlock(existing, HEADER)
    expect(out).not.toContain(HEADER)
    expect(out).toContain('[other]')
    expect(out).toContain('x = 1')
  })

  it('returns content unchanged when our block is absent', () => {
    const existing = `[other]\nx = 1\n`
    expect(removeTomlBlock(existing, HEADER)).toBe(existing)
  })

  it('returns empty string when the file held only our block', () => {
    expect(removeTomlBlock(`[${HEADER}]\nurl = "${URL}"\n`, HEADER)).toBe('')
  })
})
