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
  registerCliScreenshotTools,
  registerCliRunTool,
  registerCliCuratedTools,
  registerCliEvalTool,
  registerAuditTool,
  registerGraphTools,
  registerPatchTools,
  registerRemediationTools,
} from '@/infrastructure/obsidian/mcp'
import { NodeObsidianCliAdapter } from '@/infrastructure/node/NodeObsidianCliAdapter'
import { McpStatusBar } from './McpStatusBar'
import { CombinedSettingsTab } from './CombinedSettingsTab'
import { obsidianFs } from '../infrastructure/obsidian/catalog/catalogFs'
import { loadBundledCatalog } from '../application/catalog/source'
import { appendAudit } from '../application/catalog/auditlog'
import type { ToolCallAuditEntry } from '../application/catalog/auditlog'
import bundledIndex from '../../catalog/index.json'

export default class SpecoratorMcpPlugin extends Plugin {
  settings!: PluginSettings
  private mcp?: ObsidianMcpServerAdapter
  private bridge?: ObsidianBridge
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

  /**
   * Obsidian CLI adapter constructed once on load and reused across server
   * start/stop cycles. Reads obsidianBinPath from settings on each invocation.
   */
  private cli?: NodeObsidianCliAdapter

  async onload(): Promise<void> {
    await this.loadSettings()

    this.autoRegister = new AutoRegister(new NodeFileSystemAdapter(), this.bridge)
    this.cli = new NodeObsidianCliAdapter({ getSettings: () => this.settings })

    // Single combined tab: MCP server config + Workflow Catalog (fixes double settings entry).
    try {
      const catalogIndex = loadBundledCatalog(JSON.stringify(bundledIndex))
      this.addSettingTab(
        new CombinedSettingsTab(this.app, this, obsidianFs(this.app), catalogIndex),
      )
    } catch (err: unknown) {
      new Notice('Specorator catalog is corrupted; reinstall the plugin or report an issue.', 0)
      this.bridge?.error('catalog/index.json failed to parse', err)
    }

    this.addCommand({
      id: 'start-mcp-server',
      name: 'Start MCP server',
      callback: async () => {
        try {
          await this.startServer()
        } catch (err: unknown) {
          new Notice(
            `MCP server failed to start: ${err instanceof Error ? err.message : String(err)}`,
            10000,
          )
        }
      },
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
        try {
          await this.stopServer()
          await this.startServer()
        } catch (err: unknown) {
          new Notice(
            `MCP server failed to restart: ${err instanceof Error ? err.message : String(err)}`,
            10000,
          )
        }
      },
    })

    // Fix 8: show-audit-log command
    this.addCommand({
      id: 'show-audit-log',
      name: 'Show MCP audit log',
      callback: () => {
        this.app.workspace.openLinkText('.specorator/audit-log.jsonl', '', false)
      },
    })

    this.statusBar = new McpStatusBar(
      () => this.addStatusBarItem(),
      async () => {
        if (this.mcp) await this.stopServer()
        else await this.startServer()
      },
      () => {
        const settingApi = (
          this.app as unknown as { setting?: { open(): void; openTabById(id: string): void } }
        ).setting
        if (settingApi) {
          settingApi.open()
          settingApi.openTabById(this.manifest.id)
        }
      },
    )

    // Auto-start: if the user has opted in, start the MCP server in the
    // background immediately after plugin load. `void` is intentional —
    // onload must not block waiting for the server to bind. Failures surface
    // as a Notice so the user is not left wondering why the server is down.
    if (this.settings.autoStart) {
      void this.startServer().catch((err: unknown) => {
        new Notice(
          `MCP server auto-start failed: ${err instanceof Error ? err.message : String(err)}`,
          10000,
        )
      })
    }
  }

  async onunload(): Promise<void> {
    this.statusBar?.destroy()
    // Best-effort deregister: remove the auto-registered entries from ~/.claude.json etc.
    // before the server stops. Obsidian does not await onunload, so this is fire-and-forget;
    // if it does not finish, the stale entry is harmlessly overwritten on the next start.
    const enabledTargets = wellKnownTargets().filter((t) => this.settings.autoRegister[t.id])
    if (enabledTargets.length > 0 && this.autoRegister) {
      void this.autoRegister
        .deregister(enabledTargets)
        .catch((err: unknown) =>
          this.bridge?.warn('onunload deregister failed', { error: String(err) }),
        )
    }
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

  // ── Public helpers used by the settings UI ───────────────────────────────

  isMcpRunning(): boolean {
    return this.mcp !== undefined
  }

  getMcpPort(): number {
    return this.mcp?.boundPort ?? this.settings.port
  }

  async startServerPublic(): Promise<void> {
    return this.startServer()
  }

  async stopServerPublic(): Promise<void> {
    return this.stopServer()
  }

  async restartServerPublic(): Promise<void> {
    await this.stopServer()
    await this.startServer()
  }

  private async startServer(): Promise<void> {
    if (this.mcp) return
    const modal = new ObsidianConfirmModalAdapter(this.app)
    this.bridge = new ObsidianBridge(this.app, this)
    const bridge = this.bridge
    // Auditor: appends a JSONL entry to .specorator/audit-log.jsonl for every tool call.
    const fs = obsidianFs(this.app)
    const auditor = {
      record: (entry: ToolCallAuditEntry): Promise<void> => appendAudit(fs, entry),
    }
    // gate is assigned BEFORE setToolRegistrar — the `this.gate!` assertion below is safe.
    this.gate = new PermissionGate({ getSettings: () => this.settings }, modal, auditor)
    this.mcp = new ObsidianMcpServerAdapter({ getSettings: () => this.settings }, bridge)
    this.mcp.setToolRegistrar((server) => {
      registerVaultTools(server, { vault: bridge, gate: this.gate! })
      registerMetadataTools(server, { metadata: bridge, vault: bridge, gate: this.gate! })
      registerLinksTools(server, { metadata: bridge, vault: bridge })
      registerAuditTool(server, { vault: bridge, metadata: bridge })
      registerGraphTools(server, { vault: bridge, metadata: bridge })
      registerCanvasTools(server, { canvas: bridge, gate: this.gate!, vault: bridge })
      registerBasesTools(server, { cli: this.cli!, vault: bridge, gate: this.gate! })
      // `app.commands` is a stable runtime property not exposed in Obsidian's public TS types.
      // Cast through unknown to the minimal interface each registrar declares.
      registerObsidianCliReadTools(server, {
        app: this.app as unknown as Parameters<typeof registerObsidianCliReadTools>[1]['app'],
      })
      registerObsidianCliTools(server, {
        app: this.app as unknown as Parameters<typeof registerObsidianCliTools>[1]['app'],
        gate: this.gate!,
      })
      registerCliScreenshotTools(server, { cli: this.cli!, gate: this.gate! })
      registerCliRunTool(server, { cli: this.cli!, gate: this.gate! })
      registerCliCuratedTools(server, { cli: this.cli!, gate: this.gate! })
      registerCliEvalTool(server, {
        cli: this.cli!,
        gate: this.gate!,
        developerMode: this.settings.developerMode,
      })
      registerPatchTools(server, { vault: bridge, gate: this.gate! })
      registerRemediationTools(server, { vault: bridge, metadata: bridge, gate: this.gate! })
    })
    await this.mcp.start()
    const port = this.mcp.boundPort ?? this.settings.port
    this.bridge?.info('MCP server started', { port })

    const url = `http://127.0.0.1:${port}/mcp`
    const enabledTargets = wellKnownTargets().filter((t) => this.settings.autoRegister[t.id])
    let registeredClients: string[] = []
    if (enabledTargets.length > 0 && this.autoRegister) {
      const results = await this.autoRegister.register(url, enabledTargets)
      registeredClients = results.filter((r) => r.status === 'registered').map((r) => r.target.name)
      if (registeredClients.length > 0) {
        new Notice(`MCP server registered with: ${registeredClients.join(', ')}`)
      }
      const failed = results.filter((r) => r.status === 'failed')
      for (const f of failed) {
        this.bridge?.warn(`Auto-register ${f.target.name} failed: ${f.reason}`)
        new Notice(`MCP auto-register failed for ${f.target.name}: ${f.reason}`, 10000)
      }
    }
    this.statusBar.setRunning(port, registeredClients)
  }

  private async stopServer(): Promise<void> {
    this.bridge?.debug('MCP server stopping')
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
        const deregFailed = results.filter((r) => r.status === 'failed')
        for (const f of deregFailed) {
          this.bridge?.warn(`Auto-deregister ${f.target.name} failed: ${f.reason}`)
          new Notice(`MCP deregister failed for ${f.target.name}: ${f.reason}`, 10000)
        }
      }
    }
    await this.mcp?.stop()
    this.mcp = undefined
    this.gate = undefined
    this.bridge?.info('MCP server stopped')
    this.bridge = undefined
    this.statusBar.setStopped()
  }
}
