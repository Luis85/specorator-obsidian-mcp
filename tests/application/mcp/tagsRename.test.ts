import { describe, it, expect } from 'vitest'
import { renameTagInContent } from '@/application/mcp/tagsRename'

describe('renameTagInContent', () => {
  it('replaces inline #tag occurrence', () => {
    const content = 'This is a #project note.'
    const result = renameTagInContent(content, 'project', 'work')
    expect(result).not.toBeNull()
    expect(result!.newContent).toContain('#work')
    expect(result!.newContent).not.toContain('#project')
    expect(result!.occurrences).toBe(1)
  })

  it('replaces multiple inline occurrences', () => {
    const content = 'A #project note. Also #project here.'
    const result = renameTagInContent(content, 'project', 'work')
    expect(result).not.toBeNull()
    expect(result!.occurrences).toBe(2)
  })

  it('replaces tag in frontmatter tags array', () => {
    const content = [
      '---',
      'title: test',
      'tags:',
      '  - project',
      '  - other',
      '---',
      '',
      'body',
    ].join('\n')
    const result = renameTagInContent(content, 'project', 'work')
    expect(result).not.toBeNull()
    expect(result!.newContent).toContain('work')
    expect(result!.newContent).not.toContain('\n  - project')
  })

  it('accepts oldTag with leading # prefix', () => {
    const content = 'A #project note.'
    const result = renameTagInContent(content, '#project', '#work')
    expect(result).not.toBeNull()
    expect(result!.newContent).toContain('#work')
  })

  it('returns null when tag not present', () => {
    const content = 'A note with no matching tags.'
    const result = renameTagInContent(content, 'missing', 'other')
    expect(result).toBeNull()
  })

  it('does not replace partial matches (word boundary)', () => {
    // #projects should NOT be replaced when renaming #project
    const content = 'See #projects for details.'
    const result = renameTagInContent(content, 'project', 'work')
    // The regex matches #project followed by space/punctuation/end — #projects ends with 's', not a boundary
    // So result should be null (no match)
    if (result !== null) {
      // If it matched, the content should still contain #projects unchanged
      expect(result.newContent).toContain('#projects')
      expect(result.newContent).not.toContain('#works')
    }
  })

  it('replaces tag at end of line', () => {
    const content = 'A note #project'
    const result = renameTagInContent(content, 'project', 'work')
    expect(result).not.toBeNull()
    expect(result!.newContent).toContain('#work')
  })

  it('replaces tag followed by comma', () => {
    const content = 'Tags: #project, #other'
    const result = renameTagInContent(content, 'project', 'work')
    expect(result).not.toBeNull()
    expect(result!.newContent).toContain('#work')
  })
})
