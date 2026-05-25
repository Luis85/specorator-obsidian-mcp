import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { randomBytes } from 'node:crypto'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ObsidianCliPort } from '@/domain/ports'
import type { PermissionGate } from '@/application/mcp/PermissionGate'
import { err, deny } from './shared'

// TODO: When VaultPort grows a writeBinary(path, buffer) method, add an optional
// `savePath` input (vault-relative) that persists the PNG into the vault. For now
// the image is returned inline only to avoid the VaultPort text-only limitation.

export function registerCliScreenshotTools(
  server: McpServer,
  deps: { cli: ObsidianCliPort; gate: PermissionGate },
): void {
  const { cli, gate } = deps

  server.registerTool(
    'cli.screenshot',
    {
      description:
        'Capture a PNG screenshot of the running Obsidian window via the official CLI ' +
        '(dev:screenshot). Returns the image inline as MCP image content. ' +
        'Requires the official Obsidian CLI (>= 1.12.4) to be installed and the ' +
        'binary path configured in plugin settings.',
      inputSchema: {},
    },
    async () => {
      const decision = await gate.resolve('cli.screenshot', {})
      if (decision.decision === 'deny') return deny(decision.reason)

      const tmpFile = join(tmpdir(), `specorator-mcp-${randomBytes(8).toString('hex')}.png`)

      const result = await cli.run({
        command: 'dev:screenshot',
        args: { path: tmpFile },
        timeoutMs: 60_000,
      })

      if (result.exitCode !== 0) {
        return err(`screenshot failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`)
      }

      let png: Buffer
      try {
        png = await fs.readFile(tmpFile)
      } catch (e) {
        return err(`failed to read screenshot output: ${(e as Error).message}`)
      } finally {
        // Best-effort cleanup — do not propagate rm errors
        fs.rm(tmpFile, { force: true }).catch(() => undefined)
      }

      return {
        content: [
          { type: 'text' as const, text: `Screenshot captured: ${png.length} bytes` },
          { type: 'image' as const, data: png.toString('base64'), mimeType: 'image/png' },
        ],
      }
    },
  )
}
