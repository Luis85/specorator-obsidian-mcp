export class UnsafeVaultPathError extends Error {
  constructor(path: string, reason: string) {
    super(`Unsafe vault path "${path}": ${reason}`)
    this.name = 'UnsafeVaultPathError'
  }
}
