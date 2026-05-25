import { App, PluginSettingTab, Setting } from 'obsidian'
import type SpecoratorMcpPlugin from './main'
import {
  DEFAULT_TOOL_MODES,
  type AutoRegisterSettings,
  type ToolMode,
  type LogLevel,
} from '@/domain/settings/PluginSettings'

const MODES: ToolMode[] = ['allow', 'ask', 'deny']
const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error']

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
        t.setValue(String(this.plugin.settings.port)).onChange(async (v) => {
          const n = Number(v)
          if (!Number.isInteger(n) || n < 1 || n >= 65536) {
            portErrorEl.setText(`Invalid port "${v}" — must be an integer 1–65535.`)
            portErrorEl.style.display = 'block'
            return
          }
          portErrorEl.style.display = 'none'
          this.plugin.settings.port = n
          await this.plugin.saveSettings()
        }),
      )

    new Setting(containerEl)
      .setName('Default mode')
      .setDesc('Applied to any tool without an explicit override.')
      .addDropdown((d) => {
        for (const m of MODES) d.addOption(m, m)
        d.setValue(this.plugin.settings.defaultMode).onChange(async (v) => {
          this.plugin.settings.defaultMode = v as ToolMode
          await this.plugin.saveSettings()
        })
      })

    const timeoutErrorEl = containerEl.createEl('div', {
      cls: 'setting-item-description mod-warning',
      text: '',
    })
    timeoutErrorEl.style.display = 'none'
    new Setting(containerEl)
      .setName('Ask timeout (seconds)')
      .setDesc(
        'Modal auto-denies if you do not respond within this many seconds. Current: 30s = 30000ms internally.',
      )
      .addText((t) =>
        t
          .setValue(String(Math.round(this.plugin.settings.askTimeoutMs / 1000)))
          .onChange(async (v) => {
            const seconds = Number(v)
            if (!Number.isInteger(seconds) || seconds < 1) {
              timeoutErrorEl.setText(`Invalid timeout "${v}" — must be a whole number ≥ 1.`)
              timeoutErrorEl.style.display = 'block'
              return
            }
            timeoutErrorEl.style.display = 'none'
            this.plugin.settings.askTimeoutMs = Math.round(seconds * 1000)
            await this.plugin.saveSettings()
          }),
      )

    new Setting(containerEl).setName('Log level').addDropdown((d) => {
      for (const l of LOG_LEVELS) d.addOption(l, l)
      d.setValue(this.plugin.settings.logLevel).onChange(async (v) => {
        this.plugin.settings.logLevel = v as LogLevel
        await this.plugin.saveSettings()
      })
    })

    new Setting(containerEl)
      .setName('Obsidian CLI binary path')
      .setDesc(
        'Path to the `obsidian` CLI binary. Leave empty to auto-resolve (PATH > platform defaults).',
      )
      .addText((t) =>
        t
          .setPlaceholder('e.g. /usr/local/bin/obsidian')
          .setValue(this.plugin.settings.obsidianBinPath ?? '')
          .onChange(async (v) => {
            this.plugin.settings.obsidianBinPath = v.trim()
            await this.plugin.saveSettings()
          }),
      )

    containerEl.createEl('h2', { text: 'Path deny-list' })
    containerEl.createEl('p', {
      text: 'Glob patterns. Tool calls whose "path" param matches any pattern are denied regardless of mode.',
    })

    new Setting(containerEl).setName('Patterns (one per line)').addTextArea((t) =>
      t.setValue(this.plugin.settings.pathDenyList.join('\n')).onChange(async (v) => {
        this.plugin.settings.pathDenyList = v
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
        await this.plugin.saveSettings()
      }),
    )

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
          t.setValue(this.plugin.settings.autoRegister[client.id]).onChange(async (v) => {
            this.plugin.settings.autoRegister[client.id] = v
            await this.plugin.saveSettings()
          }),
        )
    }

    containerEl.createEl('h2', { text: 'cli.execute allowed prefixes' })
    containerEl.createEl('p', {
      text: 'Command-id prefixes that bypass the ask-gate for cli.execute (e.g. "editor:"). One per line. Does not bypass the path deny-list.',
    })

    new Setting(containerEl).setName('Allowed prefixes (one per line)').addTextArea((t) =>
      t
        .setValue((this.plugin.settings.cliExecuteAllowedPrefixes ?? []).join('\n'))
        .onChange(async (v) => {
          this.plugin.settings.cliExecuteAllowedPrefixes = v
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean)
          await this.plugin.saveSettings()
        }),
    )

    containerEl.createEl('h2', { text: 'CLI run allow-list' })
    containerEl.createEl('p', {
      text: 'Commands whose name starts with any prefix here bypass the ask flow for cli.run (external Obsidian CLI binary). Leave empty to require explicit confirmation for every CLI command. One prefix per line (e.g. "version", "help", "search", "base:"). This list is separate from the cli.execute allow-list — the two tools have different risk profiles.',
    })

    new Setting(containerEl).setName('Allowed prefixes (one per line)').addTextArea((t) =>
      t
        .setValue((this.plugin.settings.cliRunAllowedPrefixes ?? []).join('\n'))
        .onChange(async (v) => {
          this.plugin.settings.cliRunAllowedPrefixes = v
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean)
          await this.plugin.saveSettings()
        }),
    )

    containerEl.createEl('h2', { text: 'Tool modes' })
    containerEl.createEl('p', { text: 'Override per-tool. Defaults shown.' })

    const groups = new Map<string, string[]>()
    for (const tool of Object.keys(DEFAULT_TOOL_MODES).sort()) {
      const ns = tool.split('.')[0]!
      if (!groups.has(ns)) groups.set(ns, [])
      groups.get(ns)!.push(tool)
    }

    for (const [ns, tools] of groups) {
      containerEl.createEl('h3', { text: `${capitalise(ns)} tools` })
      for (const tool of tools) {
        new Setting(containerEl)
          .setName(tool)
          .setDesc(`Default: ${DEFAULT_TOOL_MODES[tool]}`)
          .addDropdown((d) => {
            for (const m of MODES) d.addOption(m, m)
            d.setValue(this.plugin.settings.toolModes[tool] ?? DEFAULT_TOOL_MODES[tool]!).onChange(
              async (v) => {
                this.plugin.settings.toolModes[tool] = v as ToolMode
                await this.plugin.saveSettings()
              },
            )
          })
      }
    }
  }
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
