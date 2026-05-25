import { describe, it, expect } from 'vitest'
import { NodeObsidianCliAdapter } from '@/infrastructure/node/NodeObsidianCliAdapter'

const OBSIDIAN_BIN = process.env.OBSIDIAN_BIN

describe.skipIf(!OBSIDIAN_BIN)(
  'NodeObsidianCliAdapter integration (env-gated by OBSIDIAN_BIN)',
  () => {
    const adapter = new NodeObsidianCliAdapter({
      getSettings: () => ({ obsidianBinPath: OBSIDIAN_BIN ?? '' }),
    })

    it('runs `obsidian version` and returns a non-empty stdout', async () => {
      const result = await adapter.run({ command: 'version', timeoutMs: 15_000 })
      expect(result.exitCode).toBe(0)
      expect(result.stdout.length).toBeGreaterThan(0)
      // Version output typically contains a number; verify loosely
      expect(result.stdout).toMatch(/\d+\.\d+/)
    })

    it('runs `obsidian help` and produces multi-line output', async () => {
      const result = await adapter.run({ command: 'help', timeoutMs: 15_000 })
      expect(result.exitCode).toBe(0)
      expect(result.stdout.split(/\r?\n/).filter((l) => l.length > 0).length).toBeGreaterThan(5)
    })

    it('returns non-zero exit code for an unknown command', async () => {
      const result = await adapter.run({
        command: 'definitely-not-a-real-command-xyz',
        timeoutMs: 5_000,
      })
      expect(result.exitCode).not.toBe(0)
    })
  },
)
