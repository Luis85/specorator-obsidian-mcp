import type { ConfirmModalPort, ConfirmModalRequest } from '@/domain/ports/ConfirmModalPort'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Field-driven test double for {@link ConfirmModalPort}.
 *
 * Safety: `nextResult` defaults to `false` — the test will read this as
 * "user rejected", which is the safe default for trust-first commits.
 *
 * Never imports `obsidian`. Never throws.
 */
export class MockConfirmModalPort implements ConfirmModalPort {
  /**
   * Canned response returned by {@link show}. Default `false` so callers
   * that forget to configure the mock take the safe rejection branch.
   */
  nextResult = false

  /**
   * Artificial delay applied before {@link show} resolves. Default `0`.
   * Useful for exercising loading-state UI under fake timers.
   */
  delayMs = 0

  /**
   * Append-only log of every request passed to {@link show}. Captured
   * before the canned response is returned so tests can inspect the
   * payload even when `nextResult === false`.
   */
  readonly calls: ConfirmModalRequest[] = []

  async show(args: ConfirmModalRequest): Promise<boolean> {
    this.calls.push(args)
    if (this.delayMs > 0) await sleep(this.delayMs)
    return this.nextResult
  }
}
