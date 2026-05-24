export class McpStatusBar {
  private element: HTMLElement | undefined

  constructor(addStatusBarItem: () => HTMLElement) {
    this.element = addStatusBarItem()
    this.element.setText('MCP: stopped')
  }

  setRunning(port: number): void {
    this.element?.setText(`MCP: 127.0.0.1:${port}`)
  }

  setStopped(): void {
    this.element?.setText('MCP: stopped')
  }

  destroy(): void {
    this.element?.remove()
    this.element = undefined
  }
}
