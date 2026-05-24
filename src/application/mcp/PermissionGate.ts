import type { PluginSettings, ToolMode } from '@/domain/settings/PluginSettings'
import type { ConfirmModalPort } from '@/domain/ports'

export interface GateDecision {
  decision: 'allow' | 'deny'
  reason: string
}

interface SettingsSource {
  getSettings(): PluginSettings
}

export class PermissionGate {
  private readonly sessionAllowed = new Set<string>()

  constructor(
    private readonly settings: SettingsSource,
    private readonly modal: ConfirmModalPort,
  ) {}

  async resolve(toolName: string, params: Record<string, unknown>): Promise<GateDecision> {
    const s = this.settings.getSettings()

    // 1. Path deny-list takes precedence
    const pathHit = this.matchPathDeny(s.pathDenyList, params)
    if (pathHit) {
      return { decision: 'deny', reason: `pathDenyList matched glob "${pathHit}"` }
    }

    // 2. cli.execute prefix allowlist — sits between deny-list and toolModes lookup
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
      .confirm({ tool: toolName, params, summary: summarise(toolName, params) })
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

function summarise(toolName: string, params: Record<string, unknown>): string {
  const path = typeof params.path === 'string' ? params.path : undefined
  return path ? `${toolName} ${path}` : toolName
}

// Minimal glob: supports * (non-slash wildcard) and ** (multi-segment wildcard).
// No external dependency. **/ at the start collapses to optional path prefix.
function matchGlob(pattern: string, input: string): boolean {
  let converted = ''
  let i = 0
  while (i < pattern.length) {
    const ch = pattern[i]
    if (ch === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') {
        converted += '(.+/)?'
        i += 3
      } else {
        converted += '.*'
        i += 2
      }
    } else if (ch === '*') {
      converted += '[^/]*'
      i++
    } else if (/[.+?^${}()|[\]\\]/.test(ch)) {
      converted += '\\' + ch
      i++
    } else {
      converted += ch
      i++
    }
  }
  const re = new RegExp('^' + converted + '$')
  return re.test(input)
}
