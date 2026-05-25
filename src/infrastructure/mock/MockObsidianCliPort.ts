import type { ObsidianCliPort, CliInvocation, CliResult } from '@/domain/ports'

type SideEffect = (invocation: CliInvocation) => Promise<void>

interface CannedEntry {
  result: CliResult
  sideEffect?: SideEffect
}

/**
 * In-memory {@link ObsidianCliPort} for unit tests.
 *
 * Register canned responses keyed by command name via {@link respond}.
 * An optional `sideEffect` callback is invoked (and awaited) BEFORE returning
 * the canned result — useful for tests that need the mock to write a file to
 * a path passed in `invocation.args` (e.g. `dev:screenshot path=<tmp>`).
 *
 * Inspect calls via {@link calls} and {@link callCount}. Reset between
 * tests with {@link reset}.
 */
export class MockObsidianCliPort implements ObsidianCliPort {
  private responses = new Map<string, CannedEntry>()
  public calls: CliInvocation[] = []

  respond(command: string, result: Partial<CliResult>, sideEffect?: SideEffect): void {
    this.responses.set(command, {
      result: { stdout: '', stderr: '', exitCode: 0, ...result },
      sideEffect,
    })
  }

  async run(invocation: CliInvocation): Promise<CliResult> {
    this.calls.push(invocation)
    const entry = this.responses.get(invocation.command)
    if (entry) {
      if (entry.sideEffect) await entry.sideEffect(invocation)
      return entry.result
    }
    return { stdout: '', stderr: 'no canned response', exitCode: 1 }
  }

  get callCount(): number {
    return this.calls.length
  }

  reset(): void {
    this.calls = []
    this.responses.clear()
  }
}
