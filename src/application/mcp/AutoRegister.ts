import { homedir } from 'node:os'
import { join } from 'node:path'
import type { FileSystemPort } from '@/domain/ports'

export interface AutoRegisterTarget {
  id: 'claudeCli' | 'cursor' | 'claudeDesktop'
  name: string
  configPath: string
}

export const SERVER_KEY = 'specorator-obsidian-mcp'

export function wellKnownTargets(): AutoRegisterTarget[] {
  const home = homedir()
  const platform = process.platform
  const desktopPath =
    platform === 'darwin'
      ? join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
      : platform === 'win32'
        ? join(process.env['APPDATA'] ?? home, 'Claude', 'claude_desktop_config.json')
        : join(home, '.config', 'Claude', 'claude_desktop_config.json')
  return [
    { id: 'claudeCli', name: 'Claude CLI', configPath: join(home, '.claude.json') },
    { id: 'cursor', name: 'Cursor', configPath: join(home, '.cursor', 'mcp.json') },
    { id: 'claudeDesktop', name: 'Claude Desktop', configPath: desktopPath },
  ]
}

export interface RegisterResult {
  target: AutoRegisterTarget
  status: 'registered' | 'deregistered' | 'skipped' | 'unchanged' | 'failed'
  reason?: string
}

export class AutoRegister {
  constructor(private readonly fs: FileSystemPort) {}

  async register(url: string, targets: AutoRegisterTarget[]): Promise<RegisterResult[]> {
    const out: RegisterResult[] = []
    for (const t of targets) {
      try {
        const existing = await this.fs.readText(t.configPath)
        let blob: Record<string, unknown> = {}
        if (existing !== null) {
          let parsed: unknown
          try {
            parsed = JSON.parse(existing)
          } catch {
            out.push({ target: t, status: 'skipped', reason: 'unparseable JSON' })
            continue
          }
          if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            out.push({ target: t, status: 'skipped', reason: 'config root not an object' })
            continue
          }
          blob = parsed as Record<string, unknown>
        }

        const rawServers = blob['mcpServers']
        const servers: Record<string, unknown> =
          rawServers !== undefined &&
          rawServers !== null &&
          typeof rawServers === 'object' &&
          !Array.isArray(rawServers)
            ? (rawServers as Record<string, unknown>)
            : {}

        const entry = { type: 'http', url }
        const prior = servers[SERVER_KEY]
        const sameUrl =
          prior !== undefined &&
          prior !== null &&
          typeof prior === 'object' &&
          'url' in prior &&
          (prior as { url?: unknown }).url === url
        if (sameUrl) {
          out.push({ target: t, status: 'unchanged' })
          continue
        }

        // Back up existing content before mutating (single rotation — overwrites previous .bak).
        if (existing !== null) {
          await this.fs.writeText(`${t.configPath}.bak`, existing)
        }
        servers[SERVER_KEY] = entry
        blob['mcpServers'] = servers
        await this.fs.writeText(t.configPath, JSON.stringify(blob, null, 2) + '\n')
        out.push({ target: t, status: 'registered' })
      } catch (err) {
        out.push({ target: t, status: 'failed', reason: (err as Error).message })
      }
    }
    return out
  }

  async deregister(targets: AutoRegisterTarget[]): Promise<RegisterResult[]> {
    const out: RegisterResult[] = []
    for (const t of targets) {
      try {
        const existing = await this.fs.readText(t.configPath)
        if (existing === null) {
          out.push({ target: t, status: 'unchanged' })
          continue
        }
        let blob: Record<string, unknown>
        try {
          blob = JSON.parse(existing) as Record<string, unknown>
        } catch {
          out.push({ target: t, status: 'skipped', reason: 'unparseable JSON' })
          continue
        }
        const servers = blob['mcpServers']
        if (
          servers === undefined ||
          servers === null ||
          typeof servers !== 'object' ||
          Array.isArray(servers) ||
          !(SERVER_KEY in (servers as object))
        ) {
          out.push({ target: t, status: 'unchanged' })
          continue
        }
        delete (servers as Record<string, unknown>)[SERVER_KEY]
        // Back up existing content before mutating (single rotation — overwrites previous .bak).
        await this.fs.writeText(`${t.configPath}.bak`, existing)
        await this.fs.writeText(t.configPath, JSON.stringify(blob, null, 2) + '\n')
        out.push({ target: t, status: 'deregistered' })
      } catch (err) {
        out.push({ target: t, status: 'failed', reason: (err as Error).message })
      }
    }
    return out
  }
}
