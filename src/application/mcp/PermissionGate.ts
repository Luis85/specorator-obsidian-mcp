import type { PluginSettings, ToolMode } from '@/domain/settings/PluginSettings'
import type { ConfirmModalPort } from '@/domain/ports'
import { matchGlob } from '@/domain/shared/matchGlob'
import type { ToolCallAuditEntry } from '@/application/catalog/auditlog'
import { redactParams } from '@/application/catalog/auditlog'

/** Defense-in-depth: reject any cliRunAllowedPrefixes entry that slipped through the UI. */
const SHELL_METACHAR_RE = /[;|&$`<>\\\n]/

export interface GateDecision {
  decision: 'allow' | 'deny'
  reason: string
}

interface SettingsSource {
  getSettings(): PluginSettings
}

export interface GateAuditor {
  record(entry: ToolCallAuditEntry): void | Promise<void>
}

export class PermissionGate {
  private readonly sessionAllowed = new Set<string>()

  /**
   * WS-Z2 Fix 3: invalidate the session-allow cache when a new catalog asset is
   * installed.  Clearing a specific tool (or all when undefined) forces the gate
   * to re-prompt on the next call, preventing a newly installed asset from silently
   * inheriting a session grant made for a prior asset.
   */
  invalidateSessionAllow(toolName?: string): void {
    if (toolName === undefined) {
      this.sessionAllowed.clear()
    } else {
      this.sessionAllowed.delete(toolName)
    }
  }

  constructor(
    private readonly settings: SettingsSource,
    private readonly modal: ConfirmModalPort,
    private readonly auditor?: GateAuditor,
  ) {}

  async resolve(toolName: string, params: Record<string, unknown>): Promise<GateDecision> {
    const decision = await this.resolveInner(toolName, params)
    void this.auditor?.record({
      kind: 'tool-call',
      tool: toolName,
      decision: decision.decision,
      reason: decision.reason,
      params: redactParams(params),
    })
    return decision
  }

  private async resolveInner(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<GateDecision> {
    const s = this.settings.getSettings()

    // 1. Path deny-list takes precedence
    const pathHit = this.matchPathDeny(s.pathDenyList, params)
    if (pathHit) {
      return { decision: 'deny', reason: `pathDenyList matched glob "${pathHit}"` }
    }

    // 2a. cli.execute prefix allowlist — sits between deny-list and toolModes lookup
    if (
      toolName === 'cli.execute' &&
      typeof params['commandId'] === 'string' &&
      s.cliExecuteAllowedPrefixes.length > 0
    ) {
      const commandId = params['commandId']
      if (s.cliExecuteAllowedPrefixes.some((p) => commandId.startsWith(p))) {
        return { decision: 'allow', reason: 'cli.execute prefix-allowed' }
      }
    }

    // 2b. cli.run prefix allowlist — separate list; different risk surface (external binary)
    if (
      toolName === 'cli.run' &&
      typeof params['command'] === 'string' &&
      s.cliRunAllowedPrefixes.length > 0
    ) {
      const command = params['command']
      const safePrefix = s.cliRunAllowedPrefixes.filter((p) => !SHELL_METACHAR_RE.test(p))
      if (safePrefix.some((p) => command.startsWith(p))) {
        return { decision: 'allow', reason: 'cli.run prefix-allowed' }
      }
    }

    // 3. Session allow cache
    if (this.sessionAllowed.has(toolName)) {
      return { decision: 'allow', reason: 'session allow' }
    }

    // 4. Per-tool mode → defaultMode
    const mode: ToolMode = s.toolModes[toolName] ?? s.defaultMode

    if (mode === 'allow') return { decision: 'allow', reason: 'toolMode allow' }
    if (mode === 'deny') return { decision: 'deny', reason: 'toolMode deny' }

    // 5. ask
    return await this.ask(toolName, params, s.askTimeoutMs)
  }

  private matchPathDeny(patterns: string[], params: Record<string, unknown>): string | null {
    const candidates = ['path', 'from', 'to', 'sourcePath', 'startPath', 'folder', 'commandId']
      .map((k) => params[k])
      .filter((v): v is string => typeof v === 'string')
    for (const candidate of candidates) {
      for (const pat of patterns) {
        if (matchGlob(pat, candidate)) return pat
      }
    }
    return null
  }

  private async ask(
    toolName: string,
    params: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<GateDecision> {
    let timer: ReturnType<typeof setTimeout> | undefined
    let timedOut = false
    const timeout = new Promise<GateDecision>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true
        resolve({ decision: 'deny', reason: 'ask timeout' })
      }, timeoutMs)
    })
    const answer = this.modal
      .confirm({ tool: toolName, params, summary: summarise(toolName, params), timeoutMs })
      .then((choice): GateDecision => {
        if (timedOut) return { decision: 'deny', reason: 'ask timeout (late answer discarded)' }
        if (choice === 'allow-session') {
          this.sessionAllowed.add(toolName)
          return { decision: 'allow', reason: 'user allowed for session' }
        }
        if (choice === 'allow') return { decision: 'allow', reason: 'user allowed once' }
        return { decision: 'deny', reason: 'user denied' }
      })
    try {
      return await Promise.race([answer, timeout])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}

export function summarise(toolName: string, params: Record<string, unknown>): string {
  const path = typeof params.path === 'string' ? params.path : undefined
  const from = typeof params.from === 'string' ? params.from : undefined
  const to = typeof params.to === 'string' ? params.to : undefined
  const commandId = typeof params.commandId === 'string' ? params.commandId : undefined
  const command = typeof params.command === 'string' ? params.command : undefined
  const contentSize = typeof params.contentSize === 'number' ? params.contentSize : undefined

  switch (toolName) {
    case 'vault.write':
      return contentSize !== undefined
        ? `Write ${contentSize} chars to "${path ?? ''}"`
        : `Write to "${path ?? ''}"`
    case 'vault.delete':
      return `Delete "${path ?? ''}"`
    case 'vault.move':
      return `Move "${from ?? ''}" → "${to ?? ''}"`
    case 'vault.createFolder':
      return `Create folder "${path ?? ''}"`
    case 'canvas.write':
      return `Update canvas "${path ?? ''}"`
    case 'cli.execute':
      return `Run Obsidian command "${commandId ?? ''}"`
    case 'cli.run':
      return `Run Obsidian CLI command "${command ?? ''}"`
    default:
      return path ? `${toolName} ${path}` : toolName
  }
}
