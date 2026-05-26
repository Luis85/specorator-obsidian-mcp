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

  it('is idempotent when called twice with the same body', () => {
    const once = upsertTomlBlock('', HEADER, [`url = "${URL}"`])
    expect(upsertTomlBlock(once, HEADER, [`url = "${URL}"`])).toBe(once)
  })

  it('preserves the blank line before the next table when replacing', () => {
    const existing = `[${HEADER}]\nurl = "http://old/mcp"\n\n[other]\nx = 1\n`
    const out = upsertTomlBlock(existing, HEADER, [`url = "${URL}"`])
    expect(out).toBe(`[${HEADER}]\nurl = "${URL}"\n\n[other]\nx = 1\n`)
  })

  it('replaces a block in a CRLF file, preserving CRLF endings', () => {
    const crlf = `# cfg\r\nmodel = "o3"\r\n\r\n[${HEADER}]\r\nurl = "http://old/mcp"\r\n`
    const out = upsertTomlBlock(crlf, HEADER, [`url = "${URL}"`])
    expect(out).not.toContain('http://old/mcp')
    expect(out).toContain(`url = "${URL}"`)
    expect((out.match(/\[mcp_servers/g) ?? []).length).toBe(1)
    expect(out.includes('\r\n')).toBe(true)
    expect(/[^\r]\n/.test(out)).toBe(false) // no bare-LF mixed in
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

  it('reads a url with a trailing inline comment', () => {
    expect(readTomlBlockUrl(`[${HEADER}]\nurl = "${URL}" # primary\n`, HEADER)).toBe(URL)
  })

  it('returns null when the block has no url key', () => {
    expect(readTomlBlockUrl(`[${HEADER}]\ncommand = "npx"\n`, HEADER)).toBeNull()
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
