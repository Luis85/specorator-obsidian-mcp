import type { ConfirmModalPort, ConfirmModalRequest, ConfirmModalChoice } from '@/domain/ports/ConfirmModalPort'

/**
 * Field-driven test double for {@link ConfirmModalPort}.
 *
 * Safety: `nextChoice` defaults to `'deny'` — the safe default for
 * trust-first permission gates. Tests that forget to configure the mock
 * will take the rejection branch.
 *
 * Never imports `obsidian`. Never throws.
 */
export class MockConfirmModalPort implements ConfirmModalPort {
  /**
   * Canned choice returned by {@link confirm}. Default `'deny'` so callers
   * that forget to configure the mock take the safe rejection branch.
   */
  nextChoice: ConfirmModalChoice = 'deny'

  /**
   * When `true`, {@link confirm} returns a never-resolving Promise.
   * Set via {@link neverAnswer}.
   */
  private _neverAnswer = false

  /**
   * Append-only log of every request passed to {@link confirm}. Captured
   * before the canned response is returned so tests can inspect the
   * payload even when `nextChoice === 'deny'`.
   */
  readonly calls: ConfirmModalRequest[] = []

  /** Number of times {@link confirm} has been called. */
  get callCount(): number {
    return this.calls.length
  }

  /** Configure the mock to return `choice` on the next call(s). */
  answerWith(choice: ConfirmModalChoice): void {
    this._neverAnswer = false
    this.nextChoice = choice
  }

  /** Configure the mock so {@link confirm} never resolves (simulates modal left open). */
  neverAnswer(): void {
    this._neverAnswer = true
  }

  /** Reset state between tests. */
  reset(): void {
    this.nextChoice = 'deny'
    this._neverAnswer = false
    this.calls.length = 0
  }

  confirm(req: ConfirmModalRequest): Promise<ConfirmModalChoice> {
    this.calls.push(req)
    if (this._neverAnswer) {
      return new Promise<ConfirmModalChoice>(() => {})
    }
    return Promise.resolve(this.nextChoice)
  }
}
