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

    new Setting(containerEl)
      .setName('Port')
      .setDesc('Loopback TCP port. Restart the server after changing.')
      .addText((t) =>
        t.setValue(String(this.plugin.settings.port)).onChange(async (v) => {
          const n = Number(v)
          if (Number.isInteger(n) && n > 0 && n < 65536) {
            this.plugin.settings.port = n
            await this.plugin.saveSettings()
          }
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

    new Setting(containerEl)
      .setName('Ask timeout (ms)')
      .setDesc('Modal auto-denies after this many milliseconds.')
      .addText((t) =>
        t.setValue(String(this.plugin.settings.askTimeoutMs)).onChange(async (v) => {
          const n = Number(v)
          if (Number.isInteger(n) && n > 0) {
            this.plugin.settings.askTimeoutMs = n
            await this.plugin.saveSettings()
          }
        }),
      )

    new Setting(containerEl).setName('Log level').addDropdown((d) => {
      for (const l of LOG_LEVELS) d.addOption(l, l)
      d.setValue(this.plugin.settings.logLevel).onChange(async (v) => {
        this.plugin.settings.logLevel = v as LogLevel
        await this.plugin.saveSettings()
      })
    })

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

    containerEl.createEl('h2', { text: 'Tool modes' })
    containerEl.createEl('p', { text: 'Override per-tool. Defaults shown.' })

    for (const tool of Object.keys(DEFAULT_TOOL_MODES).sort()) {
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
