import { describe, it, expect } from 'vitest'
import { applyPatch } from '@/application/mcp/patch'

// ---------------------------------------------------------------------------
// heading anchor
// ---------------------------------------------------------------------------

describe('applyPatch – heading anchor', () => {
  const baseContent = [
    '# Title',
    '',
    '## Section A',
    'Body of A',
    'More body',
    '',
    '## Section B',
    'Body of B',
  ].join('\n')

  it('append after a heading: section grows', () => {
    const result = applyPatch(
      baseContent,
      { type: 'heading', value: 'Section A' },
      'append',
      'Appended line',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const lines = result.result.content.split('\n')
    const aIdx = lines.findIndex((l) => l === '## Section A')
    const bIdx = lines.findIndex((l) => l === '## Section B')
    expect(lines.slice(aIdx + 1, bIdx)).toContain('Appended line')
  })

  it('replace a heading section: old content gone, new content present', () => {
    const result = applyPatch(
      baseContent,
      { type: 'heading', value: 'Section A' },
      'replace',
      'New content',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const content = result.result.content
    expect(content).toContain('New content')
    expect(content).not.toContain('Body of A')
    expect(content).not.toContain('More body')
    // Section B should still be there
    expect(content).toContain('## Section B')
  })

  it('prepend to a heading section: content inserted at top of section', () => {
    const result = applyPatch(
      baseContent,
      { type: 'heading', value: 'Section A' },
      'prepend',
      'Prepended',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const lines = result.result.content.split('\n')
    const aIdx = lines.findIndex((l) => l === '## Section A')
    // "Prepended" should appear immediately after the heading
    expect(lines[aIdx + 1]).toBe('Prepended')
  })

  it('anchor not found → err envelope', () => {
    const result = applyPatch(baseContent, { type: 'heading', value: 'Nonexistent' }, 'append', 'x')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('anchor_not_found')
  })

  it('heading match is case-sensitive', () => {
    const result = applyPatch(baseContent, { type: 'heading', value: 'section a' }, 'append', 'x')
    expect(result.ok).toBe(false)
  })

  it('returns bytesChanged > 0 when content is added', () => {
    const result = applyPatch(
      baseContent,
      { type: 'heading', value: 'Section A' },
      'append',
      'Extra text added',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.result.bytesChanged).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// block anchor
// ---------------------------------------------------------------------------

describe('applyPatch – block anchor', () => {
  const baseContent = [
    'Some introductory text.',
    '',
    'A paragraph with a block ref. ^myblock',
    '',
    'Another paragraph.',
  ].join('\n')

  it('prepend to a block: line inserted before the block line', () => {
    const result = applyPatch(
      baseContent,
      { type: 'block', value: 'myblock' },
      'prepend',
      'Inserted before',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const lines = result.result.content.split('\n')
    const blockIdx = lines.findIndex((l) => l.includes('^myblock'))
    expect(lines[blockIdx - 1]).toBe('Inserted before')
  })

  it('append after a block: line inserted after the block line', () => {
    const result = applyPatch(
      baseContent,
      { type: 'block', value: 'myblock' },
      'append',
      'Inserted after',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const lines = result.result.content.split('\n')
    const blockIdx = lines.findIndex((l) => l.includes('^myblock'))
    expect(lines[blockIdx + 1]).toBe('Inserted after')
  })

  it('replace block line', () => {
    const result = applyPatch(
      baseContent,
      { type: 'block', value: 'myblock' },
      'replace',
      'Replaced line ^myblock',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.result.content).toContain('Replaced line ^myblock')
    expect(result.result.content).not.toContain('A paragraph with a block ref. ^myblock')
  })

  it('accepts ^-prefixed block id', () => {
    const result = applyPatch(baseContent, { type: 'block', value: '^myblock' }, 'append', 'x')
    expect(result.ok).toBe(true)
  })

  it('block not found → err envelope', () => {
    const result = applyPatch(baseContent, { type: 'block', value: 'missing' }, 'append', 'x')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('anchor_not_found')
  })
})

// ---------------------------------------------------------------------------
// frontmatter anchor
// ---------------------------------------------------------------------------

describe('applyPatch – frontmatter anchor', () => {
  const baseContent = [
    '---',
    'title: My Note',
    'tags:',
    '  - alpha',
    '  - beta',
    'project:',
    '  status: active',
    '---',
    '',
    'Body text.',
  ].join('\n')

  it('replace a top-level frontmatter key', () => {
    const result = applyPatch(
      baseContent,
      { type: 'frontmatter', value: 'title' },
      'replace',
      'New Title',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.result.content).toContain('title: New Title')
    expect(result.result.content).toContain('Body text.')
  })

  it('replace nested frontmatter key via dot path', () => {
    const result = applyPatch(
      baseContent,
      { type: 'frontmatter', value: 'project.status' },
      'replace',
      'archived',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.result.content).toContain('archived')
    expect(result.result.content).not.toContain('active')
  })

  it('append to a tags array', () => {
    const result = applyPatch(
      baseContent,
      { type: 'frontmatter', value: 'tags' },
      'append',
      'gamma',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.result.content).toContain('gamma')
    // alpha and beta still present
    expect(result.result.content).toContain('alpha')
    expect(result.result.content).toContain('beta')
  })

  it('prepend to a tags array', () => {
    const result = applyPatch(
      baseContent,
      { type: 'frontmatter', value: 'tags' },
      'prepend',
      'zero',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.result.content).toContain('zero')
  })

  it('sets new key when key does not exist', () => {
    const result = applyPatch(
      baseContent,
      { type: 'frontmatter', value: 'newKey' },
      'replace',
      'newValue',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.result.content).toContain('newKey')
    expect(result.result.content).toContain('newValue')
  })

  it('preserves body text after frontmatter edit', () => {
    const result = applyPatch(baseContent, { type: 'frontmatter', value: 'title' }, 'replace', 'X')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.result.content).toContain('Body text.')
  })

  it('creates frontmatter when none exists (replace)', () => {
    const noFm = 'Just body content.'
    const result = applyPatch(noFm, { type: 'frontmatter', value: 'status' }, 'replace', 'done')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.result.content).toContain('status')
    expect(result.result.content).toContain('done')
  })
})

// ---------------------------------------------------------------------------
// eof anchor
// ---------------------------------------------------------------------------

describe('applyPatch – eof anchor', () => {
  const baseContent = 'Line 1\nLine 2\n'

  it('append at eof adds lines at end', () => {
    const result = applyPatch(baseContent, { type: 'eof' }, 'append', 'New line')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.result.content.endsWith('New line')).toBe(true)
  })

  it('prepend at eof adds lines at top', () => {
    const result = applyPatch(baseContent, { type: 'eof' }, 'prepend', 'Prepended')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.result.content.startsWith('Prepended')).toBe(true)
  })

  it('replace at eof appends like append', () => {
    const result = applyPatch(baseContent, { type: 'eof' }, 'replace', 'Replaced')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.result.content).toContain('Replaced')
  })
})
