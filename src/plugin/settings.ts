import { App, PluginSettingTab, Setting } from 'obsidian'
import type SpecoratorMcpPlugin from './main'
import { DEFAULT_TOOL_MODES, type ToolMode, type LogLevel } from '@/domain/settings/PluginSettings'

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
