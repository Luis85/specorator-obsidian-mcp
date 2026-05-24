export interface FileSystemPort {
  /** Read file as UTF-8 text. Returns null if the file does not exist. */
  readText(path: string): Promise<string | null>
  /** Write UTF-8 text to file, creating parent directories as needed. */
  writeText(path: string, content: string): Promise<void>
}
