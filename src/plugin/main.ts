import { Plugin } from 'obsidian'
import {
  DEFAULT_SETTINGS,
  DEFAULT_TOOL_MODES,
  type PluginSettings,
  type ToolMode,
} from '@/domain/settings/PluginSettings'
import { ObsidianMcpServerAdapter } from '@/infrastructure/obsidian/ObsidianMcpServerAdapter'
import { ObsidianBridge } from '@/infrastructure/obsidian/ObsidianBridge'
import { ObsidianConfirmModalAdapter } from '@/infrastructure/obsidian/ObsidianConfirmModalAdapter'
import { PermissionGate } from '@/application/mcp/PermissionGate'
import {
  registerVaultTools,
  registerMetadataTools,
  registerLinksTools,
  registerCanvasTools,
  registerBasesTools,
  registerObsidianCliReadTools,
  registerObsidianCliTools,
} from '@/infrastructure/obsidian/mcp'
import { SpecoratorMcpSettingsTab } from './settings'
import { McpStatusBar } from './McpStatusBar'

export default class SpecoratorMcpPlugin extends Plugin {
  settings!: PluginSettings
  private mcp?: ObsidianMcpServerAdapter
  private statusBar!: McpStatusBar
  /**
   * Permission gate constructed when the MCP server starts. Undefined when the server is stopped.
   *
   * gate is assigned synchronously BEFORE setToolRegistrar in startServer, so
   * the `this.gate!` non-null assertion inside the registrar callback is safe.
   */
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

    this.statusBar = new McpStatusBar(() => this.addStatusBarItem())
  }

  async onunload(): Promise<void> {
    this.statusBar.destroy()
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
    // gate is assigned BEFORE setToolRegistrar — the `this.gate!` assertion below is safe.
    this.gate = new PermissionGate({ getSettings: () => this.settings }, modal)
    this.mcp = new ObsidianMcpServerAdapter({ getSettings: () => this.settings })
    const bridge = new ObsidianBridge(this.app, this)
    this.mcp.setToolRegistrar((server) => {
      registerVaultTools(server, { vault: bridge, gate: this.gate! })
      registerMetadataTools(server, { metadata: bridge, vault: bridge })
      registerLinksTools(server, { metadata: bridge })
      registerCanvasTools(server, { canvas: bridge, gate: this.gate! })
      registerBasesTools(server, { vault: bridge })
      // `app.commands` is a stable runtime property not exposed in Obsidian's public TS types.
      // Cast through unknown to the minimal interface each registrar declares.
      registerObsidianCliReadTools(server, {
        app: this.app as unknown as Parameters<typeof registerObsidianCliReadTools>[1]['app'],
      })
      registerObsidianCliTools(server, {
        app: this.app as unknown as Parameters<typeof registerObsidianCliTools>[1]['app'],
        gate: this.gate!,
      })
    })
    await this.mcp.start()
    const port = this.mcp.boundPort ?? this.settings.port
    this.statusBar.setRunning(port)
  }

  private async stopServer(): Promise<void> {
    await this.mcp?.stop()
    this.mcp = undefined
    this.gate = undefined
    this.statusBar.setStopped()
  }
}
