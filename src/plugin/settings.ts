import { Notice, App, PluginSettingTab, Setting } from 'obsidian'
import { exec } from 'child_process'
import type SpecoratorMcpPlugin from './main'
import {
  DEFAULT_TOOL_MODES,
  type AutoRegisterSettings,
  type ToolMode,
  type LogLevel,
} from '@/domain/settings/PluginSettings'
import { applyPreset } from '@/application/settings/presets'

const MODES: ToolMode[] = ['allow', 'ask', 'deny']
const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error']

/** Shell metacharacters that must not appear in cliRunAllowedPrefixes entries. */
const CLI_RUN_METACHAR_RE = /[;|&$`<>\\\n]/

/** One-line descriptions shown under each namespace header. */
const NS_DESCRIPTIONS: Record<string, string> = {
  vault: 'Read and write notes in your vault.',
  metadata: 'Inspect frontmatter, tags, headings, links.',
  links: 'Query the link graph.',
  canvas: 'Read and write .canvas files.',
  bases: 'Query and create Obsidian Bases.',
  cli: 'Run the official Obsidian CLI.',
  graph: 'Aggregate graph statistics.',
  audit: 'Vault health audit.',
  frontmatter: 'Frontmatter set / query.',
  note: 'Surgical note edits (note.patch).',
  attachments: 'Find orphan attachments.',
  tags: 'Bulk tag operations.',
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ── Free-function render helpers ───────────────────────────────────────────────

function renderStatusBanner(
  plugin: SpecoratorMcpPlugin,
  containerEl: HTMLElement,
  onRefresh: () => void,
): void {
  const isRunning = plugin.isMcpRunning()
  const port = plugin.getMcpPort()

  const banner = containerEl.createEl('div', { cls: 'specorator-mcp-status-banner' })
  banner.style.cssText =
    'display:flex;align-items:center;gap:8px;padding:8px 12px;margin-bottom:16px;' +
    'border-radius:6px;background:var(--background-modifier-border);'

  const dot = banner.createEl('span')
  dot.style.cssText = isRunning
    ? 'width:10px;height:10px;border-radius:50%;background:var(--color-green,#4caf50);flex-shrink:0;'
    : 'width:10px;height:10px;border-radius:50%;background:var(--text-muted,#888);flex-shrink:0;'

  const statusText = banner.createEl('span', {
    text: isRunning ? `MCP server running on port ${port}` : 'MCP server stopped',
  })
  statusText.style.flex = '1'

  if (!isRunning) {
    const startBtn = banner.createEl('button', { text: 'Start server' })
    startBtn.onclick = () => {
      void plugin.startServerPublic().then(() => onRefresh())
    }
    // First-run nudge: brief orientation for new users below the status row.
    const nudge = containerEl.createEl('p', {
      text: 'MCP server is not running. Start it to allow AI tools to access this vault. ',
    })
    nudge.style.cssText = 'margin:4px 0 12px;font-size:0.9em;color:var(--text-muted);'
    const link = nudge.createEl('a', {
      text: 'Open the README on GitHub →',
      href: 'https://github.com/Luis85/specorator-obsidian-mcp#quick-start',
    })
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
  } else {
    const restartBtn = banner.createEl('button', { text: 'Restart server' })
    restartBtn.style.marginRight = '4px'
    restartBtn.onclick = () => {
      void plugin.restartServerPublic().then(() => onRefresh())
    }

    const stopBtn = banner.createEl('button', { text: 'Stop server' })
    stopBtn.onclick = () => {
      void plugin.stopServerPublic().then(() => onRefresh())
    }
  }
}

function renderPresetButtons(
  plugin: SpecoratorMcpPlugin,
  containerEl: HTMLElement,
  onRefresh: () => void,
): void {
  const row = containerEl.createEl('div', { cls: 'specorator-mcp-preset-row' })
  row.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;'

  const allAskBtn = row.createEl('button', { text: 'All ask' })
  allAskBtn.title = 'Set every tool mode to "ask" (safest — always prompts before acting)'
  allAskBtn.onclick = async () => {
    plugin.settings = applyPreset(plugin.settings, 'all-ask')
    await plugin.saveSettings()
    onRefresh()
  }

  const safeBtn = row.createEl('button', { text: 'Safe defaults' })
  safeBtn.title = 'Restore the as-shipped DEFAULT_TOOL_MODES'
  safeBtn.onclick = async () => {
    plugin.settings = applyPreset(plugin.settings, 'safe-defaults')
    await plugin.saveSettings()
    onRefresh()
  }

  const allAllowBtn = row.createEl('button', { text: 'All allow (advanced)' })
  allAllowBtn.title = 'Grant full access — only use in isolated / trusted environments'
  allAllowBtn.style.color = 'var(--text-warning, #ff6b6b)'
  allAllowBtn.onclick = async () => {
    plugin.settings = applyPreset(plugin.settings, 'all-allow')
    await plugin.saveSettings()
    new Notice(
      'This grants the MCP client full access. Only do this in isolated environments.',
      8000,
    )
    onRefresh()
  }
}

/**
 * Render all MCP server settings into `containerEl`.
 * Extracted so `CombinedSettingsTab` can embed this section without
 * instantiating a second `PluginSettingTab`.
 *
 * @param onRefresh - callback to re-render the owning tab (pass `() => tab.display()`)
 */
export function renderMcpServerSettings(
  plugin: SpecoratorMcpPlugin,
  containerEl: HTMLElement,
  onRefresh: () => void,
): void {
  // ── Server status banner ──────────────────────────────────────────────────
  renderStatusBanner(plugin, containerEl, onRefresh)

  containerEl.createEl('h2', { text: 'Server' })

  const portErrorEl = containerEl.createEl('div', {
    cls: 'setting-item-description mod-warning',
    text: '',
  })
  portErrorEl.style.display = 'none'
  new Setting(containerEl)
    .setName('Port')
    .setDesc('Loopback TCP port (1–65535). Restart the server after changing.')
    .addText((t) =>
      t.setValue(String(plugin.settings.port)).onChange(async (v) => {
        const n = Number(v)
        if (!Number.isInteger(n) || n < 1 || n >= 65536) {
          portErrorEl.setText(`Invalid port "${v}" — must be an integer 1–65535.`)
          portErrorEl.style.display = 'block'
          return
        }
        portErrorEl.style.display = 'none'
        plugin.settings.port = n
        await plugin.saveSettings()
      }),
    )

  new Setting(containerEl)
    .setName('Default mode')
    .setDesc('Applied to any tool without an explicit override.')
    .addDropdown((d) => {
      for (const m of MODES) d.addOption(m, m)
      d.setValue(plugin.settings.defaultMode).onChange(async (v) => {
        plugin.settings.defaultMode = v as ToolMode
        await plugin.saveSettings()
      })
    })

  const timeoutErrorEl = containerEl.createEl('div', {
    cls: 'setting-item-description mod-warning',
    text: '',
  })
  timeoutErrorEl.style.display = 'none'
  new Setting(containerEl)
    .setName('Ask timeout (seconds)')
    .setDesc('Modal auto-denies after this many seconds with no response.')
    .addText((t) =>
      t.setValue(String(Math.round(plugin.settings.askTimeoutMs / 1000))).onChange(async (v) => {
        const seconds = Number(v)
        if (!Number.isInteger(seconds) || seconds < 1) {
          timeoutErrorEl.setText(`Invalid timeout "${v}" — must be a whole number ≥ 1.`)
          timeoutErrorEl.style.display = 'block'
          return
        }
        timeoutErrorEl.style.display = 'none'
        plugin.settings.askTimeoutMs = Math.round(seconds * 1000)
        await plugin.saveSettings()
      }),
    )

  new Setting(containerEl).setName('Log level').addDropdown((d) => {
    for (const l of LOG_LEVELS) d.addOption(l, l)
    d.setValue(plugin.settings.logLevel).onChange(async (v) => {
      plugin.settings.logLevel = v as LogLevel
      await plugin.saveSettings()
    })
  })

  new Setting(containerEl)
    .setName('Auto-start on Obsidian startup')
    .setDesc(
      'Start the MCP server automatically when Obsidian loads this plugin. Default off. ' +
        'If the port is already in use at startup, a Notice will appear and the server will not start — change the port below.',
    )
    .addToggle((t) =>
      t.setValue(plugin.settings.autoStart ?? false).onChange(async (v) => {
        plugin.settings.autoStart = v
        await plugin.saveSettings()
      }),
    )

  // ── Obsidian CLI binary path with auto-detect button ─────────────────────
  new Setting(containerEl)
    .setName('Obsidian CLI binary path')
    .setDesc(
      'Path to the `obsidian` CLI binary. Leave empty to auto-resolve (PATH > platform defaults).',
    )
    .addText((t) =>
      t
        .setPlaceholder('e.g. /usr/local/bin/obsidian')
        .setValue(plugin.settings.obsidianBinPath ?? '')
        .onChange(async (v) => {
          plugin.settings.obsidianBinPath = v.trim()
          await plugin.saveSettings()
        }),
    )
    .addExtraButton((btn) => {
      btn
        .setIcon('search')
        .setTooltip('Auto-detect Obsidian CLI binary in PATH')
        .onClick(() => {
          const cmd = process.platform === 'win32' ? 'where Obsidian.com' : 'which obsidian'
          exec(cmd, (err, stdout) => {
            if (err || !stdout.trim()) {
              new Notice(
                'No obsidian binary found in PATH; install Obsidian CLI from Settings → General in Obsidian.',
              )
              return
            }
            const resolved = stdout.trim().split(/\r?\n/)[0]!.trim()
            plugin.settings.obsidianBinPath = resolved
            void plugin.saveSettings().then(() => {
              new Notice(`CLI binary found: ${resolved}`)
              onRefresh()
            })
          })
        })
    })

  // ── Path deny-list ────────────────────────────────────────────────────────
  containerEl.createEl('h2', { text: 'Path deny-list' })
  const denyDesc = containerEl.createEl('p', {
    text: 'Glob patterns (micromatch syntax — see ',
  })
  denyDesc.createEl('a', {
    text: 'path-deny-list glossary',
    href: 'docs/glossary/path-deny-list.md',
  })
  denyDesc.appendText(
    '). Tool calls whose "path" param matches any pattern are denied regardless of mode. Use `.` to match the vault root itself; use `**` to match recursively.',
  )

  new Setting(containerEl).setName('Patterns (one per line)').addTextArea((t) =>
    t.setValue(plugin.settings.pathDenyList.join('\n')).onChange(async (v) => {
      plugin.settings.pathDenyList = v
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
      await plugin.saveSettings()
    }),
  )

  // ── Auto-register ─────────────────────────────────────────────────────────
  containerEl.createEl('h2', { text: 'Auto-register MCP URL with clients' })
  containerEl.createEl('p', {
    text: 'When the server starts, write the MCP URL into well-known client config files. Changes take effect on next start of the server.',
  })

  const autoRegisterClients: { id: keyof AutoRegisterSettings; label: string; desc: string }[] = [
    {
      id: 'claudeCli',
      label: 'Claude CLI',
      desc: '~/.claude.json — written by `claude mcp add`; safe to auto-update.',
    },
    {
      id: 'cursor',
      label: 'Cursor',
      desc: '~/.cursor/mcp.json — opt in if you use Cursor.',
    },
    {
      id: 'claudeDesktop',
      label: 'Claude Desktop',
      desc: 'claude_desktop_config.json — opt in if you use Claude Desktop.',
    },
  ]

  for (const client of autoRegisterClients) {
    new Setting(containerEl)
      .setName(client.label)
      .setDesc(client.desc)
      .addToggle((t) =>
        t.setValue(plugin.settings.autoRegister[client.id]).onChange(async (v) => {
          plugin.settings.autoRegister[client.id] = v
          await plugin.saveSettings()
        }),
      )
  }

  // ── cli.execute allowed prefixes ──────────────────────────────────────────
  containerEl.createEl('h2', { text: 'cli.execute allowed prefixes' })
  containerEl.createEl('p', {
    text: 'Command-id prefixes that bypass the ask-gate for cli.execute (e.g. "editor:"). One per line. Does not bypass the path deny-list.',
  })

  new Setting(containerEl).setName('Allowed prefixes (one per line)').addTextArea((t) =>
    t.setValue((plugin.settings.cliExecuteAllowedPrefixes ?? []).join('\n')).onChange(async (v) => {
      plugin.settings.cliExecuteAllowedPrefixes = v
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
      await plugin.saveSettings()
    }),
  )

  // ── CLI run allow-list ────────────────────────────────────────────────────
  containerEl.createEl('h2', { text: 'CLI run allow-list' })
  containerEl.createEl('p', {
    text: 'Commands whose name starts with any prefix here bypass the ask flow for cli.run (external Obsidian CLI binary). Leave empty to require explicit confirmation for every CLI command. One prefix per line (e.g. "version", "help", "search", "base:"). This list is separate from the cli.execute allow-list — the two tools have different risk profiles.',
  })

  const cliRunErrorEl = containerEl.createEl('div', {
    cls: 'setting-item-description mod-warning',
    text: '',
  })
  cliRunErrorEl.style.display = 'none'
  new Setting(containerEl).setName('Allowed prefixes (one per line)').addTextArea((t) =>
    t.setValue((plugin.settings.cliRunAllowedPrefixes ?? []).join('\n')).onChange(async (v) => {
      const parsed = v
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
      const invalid = parsed.filter((p) => CLI_RUN_METACHAR_RE.test(p))
      if (invalid.length > 0) {
        cliRunErrorEl.setText(
          `Rejected prefix(es) contain shell metacharacters (;|&$\`<>\\): ${invalid.map((p) => `"${p}"`).join(', ')}`,
        )
        cliRunErrorEl.style.display = 'block'
        return
      }
      cliRunErrorEl.style.display = 'none'
      plugin.settings.cliRunAllowedPrefixes = parsed
      await plugin.saveSettings()
    }),
  )

  // ── Developer mode ────────────────────────────────────────────────────────
  containerEl.createEl('h3', { text: 'Developer mode' })
  const developerWarning = containerEl.createEl('p', {
    text: 'Enabling developer mode registers the cli.eval tool, which lets MCP clients execute arbitrary JavaScript in Obsidian. Only enable if you understand the risk and trust the connected client.',
  })
  developerWarning.style.color = 'var(--text-warning, #ff6b6b)'

  new Setting(containerEl)
    .setName('Enable developer mode')
    .setDesc(
      'Restart the MCP server after toggling (Settings → command palette → Restart MCP server).',
    )
    .addToggle((t) =>
      t.setValue(plugin.settings.developerMode).onChange(async (v) => {
        plugin.settings.developerMode = v
        await plugin.saveSettings()
      }),
    )

  // ── Tool modes ────────────────────────────────────────────────────────────
  containerEl.createEl('h2', { text: 'Tool modes' })
  containerEl.createEl('p', { text: 'Override per-tool. Defaults shown.' })

  // Quick preset buttons
  renderPresetButtons(plugin, containerEl, onRefresh)

  // Group tools by namespace
  const groups = new Map<string, string[]>()
  for (const tool of Object.keys(DEFAULT_TOOL_MODES).sort()) {
    const ns = tool.split('.')[0]!
    if (!groups.has(ns)) groups.set(ns, [])
    groups.get(ns)!.push(tool)
  }

  for (const [ns, tools] of groups) {
    containerEl.createEl('h3', { text: `${capitalise(ns)} tools` })
    const nsDesc = NS_DESCRIPTIONS[ns]
    if (nsDesc) {
      containerEl.createEl('p', { text: nsDesc, cls: 'setting-item-description' })
    }
    for (const tool of tools) {
      new Setting(containerEl)
        .setName(tool)
        .setDesc(`Default: ${DEFAULT_TOOL_MODES[tool]}`)
        .addDropdown((d) => {
          for (const m of MODES) d.addOption(m, m)
          d.setValue(plugin.settings.toolModes[tool] ?? DEFAULT_TOOL_MODES[tool]!).onChange(
            async (v) => {
              plugin.settings.toolModes[tool] = v as ToolMode
              await plugin.saveSettings()
            },
          )
        })
    }
  }
}

// ── PluginSettingTab subclass (kept for backward compatibility) ─────────────────

export class SpecoratorMcpSettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: SpecoratorMcpPlugin,
  ) {
    super(app, plugin)
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()
    renderMcpServerSettings(this.plugin, containerEl, () => this.display())
  }
}
