import { describe, it, expect } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createHash } from 'node:crypto'
import { registerPatchTools } from '@/infrastructure/obsidian/mcp/registerPatchTools'
import { PermissionGate } from '@/application/mcp/PermissionGate'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
import { fakeModulePorts } from '@@/__fakes__/fake-ports'
import { makeAllowGate, getHandler } from '@@/__fakes__/gate-helpers'

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

function setup() {
  const ports = fakeModulePorts()
  const gate = makeAllowGate(ports.confirmModal)
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  registerPatchTools(server, { vault: ports.vault, gate })
  return { server, ports, gate }
}

// ---------------------------------------------------------------------------
// note.patch
// ---------------------------------------------------------------------------

describe('note.patch', () => {
  const baseNote = [
    '---',
    'title: Test Note',
    'status: draft',
    '---',
    '',
    '## Introduction',
    '',
    'Intro body.',
    '',
    '## Details',
    '',
    'Detail body. ^detail-block',
    '',
  ].join('\n')

  it('append after a heading: section grows', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('note.md', baseNote)
    const res = (await getHandler(
      server,
      'note.patch',
    )({
      path: 'note.md',
      anchor: { type: 'heading', value: 'Introduction' },
      op: 'append',
      content: 'Appended paragraph.',
    })) as { structuredContent: { path: string; bytesChanged: number; newHash: string } }
    expect(res.structuredContent.bytesChanged).toBeGreaterThan(0)
    const written = await ports.vault.readFile('note.md')
    expect(written).toContain('Appended paragraph.')
    expect(written).toContain('Intro body.')
  })

  it('replace a heading section: old content gone, new in', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('note.md', baseNote)
    await getHandler(
      server,
      'note.patch',
    )({
      path: 'note.md',
      anchor: { type: 'heading', value: 'Introduction' },
      op: 'replace',
      content: 'Brand new intro.',
    })
    const written = await ports.vault.readFile('note.md')
    expect(written).toContain('Brand new intro.')
    expect(written).not.toContain('Intro body.')
    expect(written).toContain('## Details')
  })

  it('prepend to a block: line inserted before', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('note.md', baseNote)
    await getHandler(
      server,
      'note.patch',
    )({
      path: 'note.md',
      anchor: { type: 'block', value: 'detail-block' },
      op: 'prepend',
      content: 'Before block.',
    })
    const written = await ports.vault.readFile('note.md')
    const lines = written.split('\n')
    const blockIdx = lines.findIndex((l) => l.includes('^detail-block'))
    expect(lines[blockIdx - 1]).toBe('Before block.')
  })

  it('frontmatter.set via patch: writes the field', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('note.md', baseNote)
    await getHandler(
      server,
      'note.patch',
    )({
      path: 'note.md',
      anchor: { type: 'frontmatter', value: 'status' },
      op: 'replace',
      content: 'published',
    })
    const written = await ports.vault.readFile('note.md')
    expect(written).toContain('published')
    expect(written).not.toContain('draft')
  })

  it('anchor not found → err envelope', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('note.md', baseNote)
    const res = (await getHandler(
      server,
      'note.patch',
    )({
      path: 'note.md',
      anchor: { type: 'heading', value: 'Nonexistent Section' },
      op: 'append',
      content: 'x',
    })) as { isError: boolean; content: [{ text: string }] }
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toMatch(/anchor_not_found/)
  })

  it('gate denies → deny envelope, file not modified', async () => {
    const ports = fakeModulePorts()
    ;(ports.confirmModal as unknown as { answerWith(c: 'deny'): void }).answerWith('deny')
    const gate = new PermissionGate(
      { getSettings: () => ({ ...DEFAULT_SETTINGS, defaultMode: 'ask' as const }) },
      ports.confirmModal,
    )
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerPatchTools(server, { vault: ports.vault, gate })
    const original = '## Section\nOriginal.'
    await ports.vault.writeFile('note.md', original)
    const res = (await getHandler(
      server,
      'note.patch',
    )({
      path: 'note.md',
      anchor: { type: 'heading', value: 'Section' },
      op: 'replace',
      content: 'Should not appear.',
    })) as { isError: boolean }
    expect(res.isError).toBe(true)
    expect(await ports.vault.readFile('note.md')).toBe(original)
  })

  it('returns newHash matching SHA-256 of resulting content', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('note.md', baseNote)
    const res = (await getHandler(
      server,
      'note.patch',
    )({
      path: 'note.md',
      anchor: { type: 'heading', value: 'Introduction' },
      op: 'append',
      content: 'Extra.',
    })) as { structuredContent: { newHash: string } }
    const written = await ports.vault.readFile('note.md')
    expect(res.structuredContent.newHash).toBe(sha256(written))
  })

  it('file not found → err envelope', async () => {
    const { server } = setup()
    const res = (await getHandler(
      server,
      'note.patch',
    )({
      path: 'missing.md',
      anchor: { type: 'heading', value: 'X' },
      op: 'append',
      content: 'x',
    })) as { isError: boolean; content: [{ text: string }] }
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toMatch(/file not found/)
  })

  it('rejects unsafe path', async () => {
    const { server } = setup()
    const res = (await getHandler(
      server,
      'note.patch',
    )({
      path: '../../evil.md',
      anchor: { type: 'eof' },
      op: 'append',
      content: 'x',
    })) as { isError: boolean }
    expect(res.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// vault.hash
// ---------------------------------------------------------------------------

describe('vault.hash', () => {
  it('returns SHA-256 and byte size for existing file', async () => {
    const { server, ports } = setup()
    const content = 'Hello, vault!'
    await ports.vault.writeFile('file.md', content)
    const res = (await getHandler(server, 'vault.hash')({ path: 'file.md' })) as {
      structuredContent: { hash: string; bytes: number }
    }
    const expectedHash = sha256(content)
    expect(res.structuredContent.hash).toBe(expectedHash)
    expect(res.structuredContent.bytes).toBe(new TextEncoder().encode(content).length)
  })

  it('returns err for missing file', async () => {
    const { server } = setup()
    const res = (await getHandler(server, 'vault.hash')({ path: 'nope.md' })) as {
      isError: boolean
    }
    expect(res.isError).toBe(true)
  })

  it('rejects unsafe path', async () => {
    const { server } = setup()
    const res = (await getHandler(server, 'vault.hash')({ path: '../secret' })) as {
      isError: boolean
    }
    expect(res.isError).toBe(true)
  })

  it('hash changes when file content changes', async () => {
    const { server, ports } = setup()
    await ports.vault.writeFile('doc.md', 'version 1')
    const res1 = (await getHandler(server, 'vault.hash')({ path: 'doc.md' })) as {
      structuredContent: { hash: string }
    }
    await ports.vault.writeFile('doc.md', 'version 2')
    const res2 = (await getHandler(server, 'vault.hash')({ path: 'doc.md' })) as {
      structuredContent: { hash: string }
    }
    expect(res1.structuredContent.hash).not.toBe(res2.structuredContent.hash)
  })
})
