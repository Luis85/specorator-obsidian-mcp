import { Plugin } from 'obsidian'
import { DEFAULT_SETTINGS, DEFAULT_TOOL_MODES, type PluginSettings, type ToolMode } from '@/domain/settings/PluginSettings'
import { ObsidianMcpServerAdapter } from '@/infrastructure/obsidian/ObsidianMcpServerAdapter'
import { ObsidianConfirmModalAdapter } from '@/infrastructure/obsidian/ObsidianConfirmModalAdapter'
import { PermissionGate } from '@/application/mcp/PermissionGate'
import { SpecoratorMcpSettingsTab } from './settings'

export default class SpecoratorMcpPlugin extends Plugin {
  settings!: PluginSettings
  private mcp?: ObsidianMcpServerAdapter
  /** Exposed for PR6 registrar wiring. */
  gate?: PermissionGate

  async onload(): Promise<void> {
    await this.loadSettings()

    this.addSettingTab(new SpecoratorMcpSettingsTab(this.app, this))

    this.addCommand({
      id: 'start-mcp-server',
      name: 'Start MCP server',
      callback: async () => this.startServer(),
    })

    this.addCommand({
      id: 'stop-mcp-server',
      name: 'Stop MCP server',
      callback: async () => this.stopServer(),
    })
  }

  async onunload(): Promise<void> {
    await this.stopServer()
  }

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Partial<PluginSettings> | null
    const storedToolModes = stored?.toolModes ?? {}
    const toolModes = Object.fromEntries(
      Object.keys(DEFAULT_TOOL_MODES).map((k) => [
        k,
        storedToolModes[k] ?? DEFAULT_SETTINGS.toolModes[k],
      ]),
    ) as Record<string, ToolMode>
    this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}), toolModes }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
  }

  private async startServer(): Promise<void> {
    if (this.mcp) return
    const modal = new ObsidianConfirmModalAdapter(this.app)
    this.gate = new PermissionGate({ getSettings: () => this.settings }, modal)
    this.mcp = new ObsidianMcpServerAdapter({ getSettings: () => this.settings })
    this.mcp.setToolRegistrar((server) => {
      // tool registrars wired in PR6
      void server
    })
    await this.mcp.start()
  }

  private async stopServer(): Promise<void> {
    await this.mcp?.stop()
    this.mcp = undefined
    this.gate = undefined
  }
}
