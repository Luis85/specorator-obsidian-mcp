import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ObsidianCliPort, CliInvocation, CliResult } from '@/domain/ports'

const exec = promisify(execFile)

export class NodeObsidianCliAdapter implements ObsidianCliPort {
  constructor(
    private readonly settingsSource: { getSettings(): { obsidianBinPath: string } },
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}

  async run(inv: CliInvocation): Promise<CliResult> {
    const bin = this.resolveBin()
    const argv: string[] = []

    if (inv.vault) argv.push(`vault=${inv.vault}`)
    argv.push(inv.command)

    if (inv.args) {
      for (const [k, v] of Object.entries(inv.args)) {
        if (v === true) argv.push(k)
        else if (v === false) continue
        else argv.push(`${k}=${String(v)}`)
      }
    }

    if (inv.flags) argv.push(...inv.flags)

    try {
      const { stdout, stderr } = await exec(bin, argv, {
        timeout: inv.timeoutMs ?? 30_000,
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
      })
      return { stdout, stderr, exitCode: 0 }
    } catch (e) {
      const err = e as NodeJS.ErrnoException & {
        stdout?: string
        stderr?: string
        code?: number | string
      }
      return {
        stdout: err.stdout ?? '',
        stderr: err.stderr ?? String(err.message ?? ''),
        exitCode: typeof err.code === 'number' ? err.code : 1,
      }
    }
  }

  private resolveBin(): string {
    const envBin = this.env.OBSIDIAN_BIN
    if (envBin && envBin.trim()) return envBin

    const settingBin = this.settingsSource.getSettings().obsidianBinPath
    if (settingBin && settingBin.trim()) return settingBin

    if (this.platform === 'darwin') return '/usr/local/bin/obsidian'
    if (this.platform === 'win32') return 'Obsidian.com'
    return 'obsidian'
  }
}
