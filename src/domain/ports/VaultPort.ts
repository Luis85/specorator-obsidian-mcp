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
}
