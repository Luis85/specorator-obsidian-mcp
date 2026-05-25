import { describe, it, expect, vi, beforeEach } from 'vitest'
import { McpStatusBar } from '@/plugin/McpStatusBar'

function makeFakeEl() {
  return {
    setText: vi.fn(),
    title: '',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    remove: vi.fn(),
  } as unknown as HTMLElement
}

describe('McpStatusBar', () => {
  let fakeEl: ReturnType<typeof makeFakeEl>
  let onToggle: ReturnType<typeof vi.fn>
  let onOpenSettings: ReturnType<typeof vi.fn>
  let statusBar: McpStatusBar

  beforeEach(() => {
    fakeEl = makeFakeEl()
    onToggle = vi.fn()
    onOpenSettings = vi.fn()
    statusBar = new McpStatusBar(
      () => fakeEl as unknown as HTMLElement,
      onToggle as unknown as () => void,
      onOpenSettings as unknown as () => void,
    )
  })

  it('constructor sets stopped state and tooltip', () => {
    const el = fakeEl as unknown as { setText: ReturnType<typeof vi.fn>; title: string }
    expect(el.setText).toHaveBeenCalledWith('MCP: stopped')
    expect(el.title).toBe('MCP server stopped. Click to start. Right-click for settings.')
  })

  it('setRunning updates text and tooltip', () => {
    statusBar.setRunning(7842)
    const el = fakeEl as unknown as { setText: ReturnType<typeof vi.fn>; title: string }
    expect(el.setText).toHaveBeenCalledWith('MCP: 127.0.0.1:7842')
    expect(el.title).toBe(
      'MCP server running on port 7842. Click to stop. Right-click for settings.',
    )
  })

  it('wires click handler to onToggle', () => {
    const el = fakeEl as unknown as { addEventListener: ReturnType<typeof vi.fn> }
    const clickCall = el.addEventListener.mock.calls.find((c: unknown[]) => c[0] === 'click')
    expect(clickCall).toBeDefined()
    expect(clickCall![1]).toBe(onToggle)
  })

  it('wires contextmenu handler', () => {
    const el = fakeEl as unknown as { addEventListener: ReturnType<typeof vi.fn> }
    const ctxCall = el.addEventListener.mock.calls.find((c: unknown[]) => c[0] === 'contextmenu')
    expect(ctxCall).toBeDefined()
    expect(typeof ctxCall![1]).toBe('function')
  })

  it('contextmenu handler calls preventDefault and onOpenSettings', () => {
    const el = fakeEl as unknown as { addEventListener: ReturnType<typeof vi.fn> }
    const ctxCall = el.addEventListener.mock.calls.find((c: unknown[]) => c[0] === 'contextmenu')
    const handler = ctxCall![1] as (e: { preventDefault: ReturnType<typeof vi.fn> }) => void
    const preventDefault = vi.fn()
    handler({ preventDefault })
    expect(preventDefault).toHaveBeenCalled()
    expect(onOpenSettings).toHaveBeenCalled()
  })

  it('destroy removes both event listeners', () => {
    statusBar.destroy()
    const el = fakeEl as unknown as { removeEventListener: ReturnType<typeof vi.fn> }
    const removedEvents = el.removeEventListener.mock.calls.map((c: unknown[]) => c[0])
    expect(removedEvents).toContain('click')
    expect(removedEvents).toContain('contextmenu')
  })
})
