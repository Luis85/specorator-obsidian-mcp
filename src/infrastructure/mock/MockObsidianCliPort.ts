import type { ObsidianCliPort, CliInvocation, CliResult } from '@/domain/ports'

/**
 * In-memory {@link ObsidianCliPort} for unit tests.
 *
 * Register canned responses keyed by command name via {@link respond}.
 * Inspect calls via {@link calls} and {@link callCount}. Reset between
 * tests with {@link reset}.
 */
export class MockObsidianCliPort implements ObsidianCliPort {
  private responses = new Map<string, CliResult>()
  public calls: CliInvocation[] = []

  respond(command: string, result: Partial<CliResult>): void {
    this.responses.set(command, { stdout: '', stderr: '', exitCode: 0, ...result })
  }

  async run(invocation: CliInvocation): Promise<CliResult> {
    this.calls.push(invocation)
    const canned = this.responses.get(invocation.command)
    if (canned) return canned
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
