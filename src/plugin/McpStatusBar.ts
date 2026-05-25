export class McpStatusBar {
  private element: HTMLElement | undefined
  private readonly contextMenuHandler: (e: MouseEvent) => void

  constructor(
    addStatusBarItem: () => HTMLElement,
    private readonly onToggle: () => void,
    private readonly onOpenSettings: () => void,
  ) {
    this.contextMenuHandler = (e: MouseEvent) => {
      e.preventDefault()
      this.onOpenSettings()
    }
    this.element = addStatusBarItem()
    this.setStopped()
    this.element.addEventListener('click', this.onToggle)
    this.element.addEventListener('contextmenu', this.contextMenuHandler)
  }

  setRunning(port: number): void {
    this.element?.setText('MCP: 127.0.0.1:' + port)
    if (this.element) {
      this.element.title =
        'MCP server running on port ' + port + '. Click to stop. Right-click for settings.'
    }
  }

  setStopped(): void {
    this.element?.setText('MCP: stopped')
    if (this.element) {
      this.element.title = 'MCP server stopped. Click to start. Right-click for settings.'
    }
  }

  destroy(): void {
    this.element?.removeEventListener('click', this.onToggle)
    this.element?.removeEventListener('contextmenu', this.contextMenuHandler)
    this.element?.remove()
    this.element = undefined
  }
}
