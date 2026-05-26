import { homedir } from 'node:os'
import { join } from 'node:path'
import type { FileSystemPort, LoggerPort } from '@/domain/ports'
import { upsertTomlBlock, removeTomlBlock, readTomlBlockUrl, hasTomlBlock } from './tomlBlock'

export interface AutoRegisterTarget {
  id: 'claudeCli' | 'cursor' | 'claudeDesktop' | 'codex'
  name: string
  configPath: string
  /** Config file format. Defaults to 'json' (the historical behavior). */
  format?: 'json' | 'toml'
}

export const SERVER_KEY = 'specorator-obsidian-mcp'

// WS-Z2 Fix 2: sidecar file path for last-written-entry hashes.
// Using homedir so the sidecar persists across vault changes.
export function sidecarPath(): string {
  return join(homedir(), '.specorator-autoregister.json')
}

export function wellKnownTargets(): AutoRegisterTarget[] {
  const home = homedir()
  const platform = process.platform
  const desktopPath =
    platform === 'darwin'
      ? join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
      : platform === 'win32'
        ? join(process.env['APPDATA'] ?? home, 'Claude', 'claude_desktop_config.json')
        : join(home, '.config', 'Claude', 'claude_desktop_config.json')
  const codexHome = process.env['CODEX_HOME'] ?? join(home, '.codex')
  return [
    {
      id: 'claudeCli',
      name: 'Claude CLI',
      configPath: join(home, '.claude.json'),
      format: 'json' as const,
    },
    {
      id: 'cursor',
      name: 'Cursor',
      configPath: join(home, '.cursor', 'mcp.json'),
      format: 'json' as const,
    },
    {
      id: 'claudeDesktop',
      name: 'Claude Desktop',
      configPath: desktopPath,
      format: 'json' as const,
    },
    {
      id: 'codex',
      name: 'Codex CLI',
      configPath: join(codexHome, 'config.toml'),
      format: 'toml' as const,
    },
  ]
}

export interface RegisterResult {
  target: AutoRegisterTarget
  status: 'registered' | 'deregistered' | 'skipped' | 'unchanged' | 'failed'
  reason?: string
  /** WS-Z2 Fix 2: set when the on-disk entry differed from our last-written hash. */
  externallyMutated?: boolean
}

// ---------------------------------------------------------------------------
// WS-Z2 Fix 2: supply-chain detection helpers
// ---------------------------------------------------------------------------

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

type Sidecar = Record<string, { sha256: string }>

async function readSidecar(fs: FileSystemPort): Promise<Sidecar> {
  const raw = await fs.readText(sidecarPath())
  if (raw === null) return {}
  try {
    return JSON.parse(raw) as Sidecar
  } catch {
    return {}
  }
}

async function writeSidecar(fs: FileSystemPort, sidecar: Sidecar): Promise<void> {
  await fs.writeText(sidecarPath(), JSON.stringify(sidecar, null, 2) + '\n')
}

/**
 * Compute the sha256 of the JSON-serialised server entry blob as written by us.
 * This is the canonical form we compare against when re-reading the config.
 */
async function entryHash(entry: unknown): Promise<string> {
  return sha256Hex(JSON.stringify(entry))
}

/**
 * Check whether the current on-disk entry differs from what we last wrote.
 * Returns true (and emits a warning) when a mismatch is detected.
 */
async function detectExternalMutation(
  fs: FileSystemPort,
  configPath: string,
  currentEntry: unknown,
  logger: LoggerPort | undefined,
): Promise<boolean> {
  const sidecar = await readSidecar(fs)
  const stored = sidecar[configPath]
  if (stored === undefined) return false // first time — nothing to compare
  const currentHash = await entryHash(currentEntry)
  if (currentHash === stored.sha256) return false
  logger?.warn(
    `specorator: MCP auto-register entry in ${configPath} was modified externally — overwriting`,
  )
  return true
}

/**
 * Persist our entry's hash to the sidecar so future runs can detect tampering.
 */
async function recordWrittenHash(
  fs: FileSystemPort,
  configPath: string,
  writtenEntry: unknown,
): Promise<void> {
  const sidecar = await readSidecar(fs)
  sidecar[configPath] = { sha256: await entryHash(writtenEntry) }
  await writeSidecar(fs, sidecar)
}

/**
 * Remove the sidecar entry for a config path after deregistration.
 */
async function removeSidecarEntry(fs: FileSystemPort, configPath: string): Promise<void> {
  const sidecar = await readSidecar(fs)
  if (!(configPath in sidecar)) return
  delete sidecar[configPath]
  await writeSidecar(fs, sidecar)
}

export class AutoRegister {
  private readonly logger: LoggerPort | undefined

  constructor(
    private readonly fs: FileSystemPort,
    logger?: LoggerPort,
  ) {
    this.logger = logger
  }

  async register(url: string, targets: AutoRegisterTarget[]): Promise<RegisterResult[]> {
    const out: RegisterResult[] = []
    for (const t of targets) {
      try {
        if ((t.format ?? 'json') === 'toml') {
          out.push(await this.registerToml(t, url))
          continue
        }
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

        // WS-Z2 Fix 2: if our key already exists, compare against last-written hash.
        let externallyMutated = false
        if (prior !== undefined && prior !== null) {
          externallyMutated = await detectExternalMutation(
            this.fs,
            t.configPath,
            prior,
            this.logger,
          )
        }

        const sameUrl =
          !externallyMutated &&
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
        // WS-Z2 Fix 2: persist the hash of what we just wrote.
        await recordWrittenHash(this.fs, t.configPath, entry)
        out.push({ target: t, status: 'registered', externallyMutated })
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
        if ((t.format ?? 'json') === 'toml') {
          out.push(await this.deregisterToml(t))
          continue
        }
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

        // WS-Z2 Fix 2: warn if our entry was mutated before we remove it.
        const currentEntry = (servers as Record<string, unknown>)[SERVER_KEY]
        await detectExternalMutation(this.fs, t.configPath, currentEntry, this.logger)

        delete (servers as Record<string, unknown>)[SERVER_KEY]
        // Back up existing content before mutating (single rotation — overwrites previous .bak).
        await this.fs.writeText(`${t.configPath}.bak`, existing)
        await this.fs.writeText(t.configPath, JSON.stringify(blob, null, 2) + '\n')
        // WS-Z2 Fix 2: remove our sidecar entry — config no longer contains our key.
        await removeSidecarEntry(this.fs, t.configPath)
        out.push({ target: t, status: 'deregistered' })
      } catch (err) {
        out.push({ target: t, status: 'failed', reason: (err as Error).message })
      }
    }
    return out
  }

  // ── TOML path (Codex) ──────────────────────────────────────────────────────
  private tomlHeader(): string {
    return `mcp_servers.${SERVER_KEY}`
  }

  private async registerToml(t: AutoRegisterTarget, url: string): Promise<RegisterResult> {
    const header = this.tomlHeader()
    const existing = await this.fs.readText(t.configPath)
    const content = existing ?? ''
    const priorUrl = readTomlBlockUrl(content, header)

    let externallyMutated = false
    if (priorUrl !== null) {
      externallyMutated = await detectExternalMutation(
        this.fs,
        t.configPath,
        { url: priorUrl },
        this.logger,
      )
    }

    if (!externallyMutated && priorUrl === url) {
      return { target: t, status: 'unchanged' }
    }

    if (existing !== null) {
      await this.fs.writeText(`${t.configPath}.bak`, existing)
    }
    const next = upsertTomlBlock(content, header, [`url = "${url}"`])
    await this.fs.writeText(t.configPath, next)
    await recordWrittenHash(this.fs, t.configPath, { url })
    return { target: t, status: 'registered', externallyMutated }
  }

  private async deregisterToml(t: AutoRegisterTarget): Promise<RegisterResult> {
    const header = this.tomlHeader()
    const existing = await this.fs.readText(t.configPath)
    if (existing === null || !hasTomlBlock(existing, header)) {
      return { target: t, status: 'unchanged' }
    }
    const priorUrl = readTomlBlockUrl(existing, header)
    if (priorUrl !== null) {
      await detectExternalMutation(this.fs, t.configPath, { url: priorUrl }, this.logger)
    }
    await this.fs.writeText(`${t.configPath}.bak`, existing)
    await this.fs.writeText(t.configPath, removeTomlBlock(existing, header))
    await removeSidecarEntry(this.fs, t.configPath)
    return { target: t, status: 'deregistered' }
  }
}
