import { describe, it, expect } from 'vitest'
import { summarise } from '@/application/mcp/PermissionGate'

describe('summarise', () => {
  it('vault.write with contentSize and path', () => {
    expect(summarise('vault.write', { path: 'notes/foo.md', contentSize: 1024 })).toBe(
      'Write 1024 chars to "notes/foo.md"',
    )
  })

  it('vault.write without contentSize falls back gracefully', () => {
    expect(summarise('vault.write', { path: 'notes/foo.md' })).toBe('Write to "notes/foo.md"')
  })

  it('vault.delete', () => {
    expect(summarise('vault.delete', { path: 'notes/old.md' })).toBe('Delete "notes/old.md"')
  })

  it('vault.move', () => {
    expect(summarise('vault.move', { from: 'a.md', to: 'b.md' })).toBe('Move "a.md" → "b.md"')
  })

  it('vault.createFolder', () => {
    expect(summarise('vault.createFolder', { path: 'archive/2024' })).toBe(
      'Create folder "archive/2024"',
    )
  })

  it('canvas.write', () => {
    expect(summarise('canvas.write', { path: 'boards/main.canvas' })).toBe(
      'Update canvas "boards/main.canvas"',
    )
  })

  it('cli.execute', () => {
    expect(summarise('cli.execute', { commandId: 'editor:save-file' })).toBe(
      'Run Obsidian command "editor:save-file"',
    )
  })

  it('unknown tool with path → legacy format', () => {
    expect(summarise('vault.read', { path: 'notes/foo.md' })).toBe('vault.read notes/foo.md')
  })

  it('unknown tool without path → tool name only', () => {
    expect(summarise('vault.list', { folder: 'notes' })).toBe('vault.list')
  })
})
