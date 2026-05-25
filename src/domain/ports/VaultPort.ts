/**
 * Reads, writes, lists, and removes vault-relative file and folder paths.
 * All paths are vault-relative (no leading slash). Implementations are
 * responsible for normalising path separators.
 */
export interface VaultPort {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  deleteFile(path: string): Promise<void>
  listFiles(folder: string): Promise<string[]>
  listFolders(parent: string): Promise<string[]>
  fileExists(path: string): Promise<boolean>
  createFolder(path: string): Promise<void>
  /**
   * Case-insensitive substring search over vault file contents.
   * Returns up to 100 matches with file path and a ~120-char excerpt.
   * Optionally scoped to a folder prefix.
   */
  searchFiles(query: string, folder?: string): Promise<Array<{ path: string; excerpt: string }>>
  /**
   * Return mtime (milliseconds since epoch) and size (bytes) for a vault file.
   * Returns null when the file does not exist or stats are unavailable.
   */
  getFileStats(path: string): Promise<{ mtime: number; size: number } | null>
}
