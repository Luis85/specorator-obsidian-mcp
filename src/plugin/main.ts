import { Notice, Plugin } from 'obsidian'
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
import { AutoRegister, wellKnownTargets } from '@/application/mcp/AutoRegister'
import { NodeFileSystemAdapter } from '@/infrastructure/node/NodeFileSystemAdapter'
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

  /**
   * AutoRegister instance constructed once on load so startup does not
   * re-instantiate NodeFileSystemAdapter on every start/stop cycle.
   * Undefined until onload completes.
   */
  private autoRegister?: AutoRegister

  async onload(): Promise<void> {
    await this.loadSettings()

    this.autoRegister = new AutoRegister(new NodeFileSystemAdapter())

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

    this.addCommand({
      id: 'restart-mcp-server',
      name: 'Restart MCP server',
      callback: async () => {
        await this.stopServer()
        await this.startServer()
      },
    })

    this.statusBar = new McpStatusBar(
      () => this.addStatusBarItem(),
      () => {
        const appAny = this.app as unknown as {
          setting: { open(): void; openTabById(id: string): void }
        }
        appAny.setting.open()
        appAny.setting.openTabById(this.manifest.id)
      },
    )
  }

  async onunload(): Promise<void> {
    this.statusBar?.destroy()
    this.mcp?.drainSync()
    void this.mcp?.stop() // fire-and-forget — Obsidian does not await onunload
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
    const autoRegister = {
      ...DEFAULT_SETTINGS.autoRegister,
      ...(stored?.autoRegister ?? {}),
    }
    this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}), toolModes, autoRegister }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
  }

  private async startServer(): Promise<void> {
    if (this.mcp) return
    const modal = new ObsidianConfirmModalAdapter(this.app)
    const bridge = new ObsidianBridge(this.app, this)
    // gate is assigned BEFORE setToolRegistrar — the `this.gate!` assertion below is safe.
    this.gate = new PermissionGate({ getSettings: () => this.settings }, modal)
    this.mcp = new ObsidianMcpServerAdapter({ getSettings: () => this.settings }, bridge)
    this.mcp.setToolRegistrar((server) => {
      registerVaultTools(server, { vault: bridge, gate: this.gate! })
      registerMetadataTools(server, { metadata: bridge, vault: bridge })
      registerLinksTools(server, { metadata: bridge })
      registerCanvasTools(server, { canvas: bridge, gate: this.gate!, vault: bridge })
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

    const url = `http://127.0.0.1:${port}/mcp`
    const enabledTargets = wellKnownTargets().filter((t) => this.settings.autoRegister[t.id])
    if (enabledTargets.length > 0 && this.autoRegister) {
      const results = await this.autoRegister.register(url, enabledTargets)
      const registered = results.filter((r) => r.status === 'registered').map((r) => r.target.name)
      if (registered.length > 0) {
        new Notice(`MCP server registered with: ${registered.join(', ')}`)
      }
      for (const f of results.filter((r) => r.status === 'failed')) {
        console.warn(`[specorator-mcp] Auto-register ${f.target.name} failed: ${f.reason}`)
      }
    }
  }

  private async stopServer(): Promise<void> {
    if (this.mcp) {
      const enabledTargets = wellKnownTargets().filter((t) => this.settings.autoRegister[t.id])
      if (enabledTargets.length > 0 && this.autoRegister) {
        const results = await this.autoRegister.deregister(enabledTargets)
        const deregistered = results
          .filter((r) => r.status === 'deregistered')
          .map((r) => r.target.name)
        if (deregistered.length > 0) {
          new Notice(`MCP server unregistered from: ${deregistered.join(', ')}`)
        }
        for (const f of results.filter((r) => r.status === 'failed')) {
          console.warn(`[specorator-mcp] Auto-deregister ${f.target.name} failed: ${f.reason}`)
        }
      }
    }
    await this.mcp?.stop()
    this.mcp = undefined
    this.gate = undefined
    this.statusBar.setStopped()
  }
}
