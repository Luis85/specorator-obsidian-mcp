export class McpStatusBar {
  private element: HTMLElement | undefined

  constructor(
    addStatusBarItem: () => HTMLElement,
    private readonly onClick: () => void,
  ) {
    this.element = addStatusBarItem()
    this.element.setText('MCP: stopped')
    this.element.title = 'MCP server stopped. Click to start, or use the command palette.'
    this.element.addEventListener('click', this.onClick)
  }

  setRunning(port: number): void {
    this.element?.setText(`MCP: 127.0.0.1:${port}`)
    if (this.element) {
      this.element.title = `MCP server running on port ${port}. Click for settings.`
    }
  }

  setStopped(): void {
    this.element?.setText('MCP: stopped')
    if (this.element) {
      this.element.title = 'MCP server stopped. Click to start, or use the command palette.'
    }
  }

  destroy(): void {
    this.element?.removeEventListener('click', this.onClick)
    this.element?.remove()
    this.element = undefined
  }
}
