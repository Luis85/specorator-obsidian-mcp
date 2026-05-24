import type { CanvasPort, JsonCanvasData } from '@/domain/ports'

/**
 * In-memory {@link CanvasPort} for unit tests.
 */
export class MockCanvasPort implements CanvasPort {
  private readonly canvasStore = new Map<string, JsonCanvasData>()
  private readonly canvasWritten = new Map<string, JsonCanvasData>()

  seedCanvas(path: string, data: JsonCanvasData): void {
    this.canvasStore.set(path, structuredClone(data))
  }

  getWrittenCanvas(path: string): JsonCanvasData | undefined {
    const data = this.canvasWritten.get(path)
    return data !== undefined ? structuredClone(data) : undefined
  }

  isCanvas(path: string): boolean {
    return path.endsWith('.canvas')
  }

  async readCanvas(path: string): Promise<JsonCanvasData> {
    const data = this.canvasStore.get(path)
    if (data === undefined) {
      throw new Error(`[MockCanvasPort] Canvas not found: ${path}`)
    }
    return structuredClone(data)
  }

  async writeCanvas(path: string, data: JsonCanvasData): Promise<void> {
    this.canvasStore.set(path, structuredClone(data))
    this.canvasWritten.set(path, structuredClone(data))
  }
}
