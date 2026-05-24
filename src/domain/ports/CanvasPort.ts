export interface JsonCanvasData {
  nodes?: unknown[]
  edges?: unknown[]
}

export interface CanvasPort {
  isCanvas(path: string): boolean
  readCanvas(path: string): Promise<JsonCanvasData>
  writeCanvas(path: string, data: JsonCanvasData): Promise<void>
}
