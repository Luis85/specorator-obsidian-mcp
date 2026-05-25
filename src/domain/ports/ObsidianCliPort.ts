export interface CliResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface CliInvocation {
  command: string // e.g. 'dev:screenshot'
  args?: Record<string, string | boolean> // e.g. { path: '/tmp/x.png' }
  flags?: string[] // e.g. ['--copy']
  timeoutMs?: number // default 30_000
  vault?: string // optional vault selector
}

export interface ObsidianCliPort {
  run(invocation: CliInvocation): Promise<CliResult>
}
