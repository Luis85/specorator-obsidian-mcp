import { App, PluginSettingTab } from 'obsidian'
import type SpecoratorMcpPlugin from './main'
import type { FileSystem, CatalogIndex } from '@/domain/catalog/types'
import { renderMcpServerSettings } from './settings'
import { renderCatalogSettings } from './CatalogSettingsTab'

/**
 * Single settings tab that hosts both the MCP server configuration and the
 * Workflow Catalog installer. Replaces the two separate `addSettingTab` calls
 * that previously produced two entries in Obsidian's Settings sidebar.
 */
export class CombinedSettingsTab extends PluginSettingTab {
  // Persist search term across rerenders (same pattern as CatalogSettingsTab).
  private catalogSearchTerm = ''

  constructor(
    app: App,
    private readonly mcpPlugin: SpecoratorMcpPlugin,
    private readonly fs: FileSystem,
    private readonly catalog: CatalogIndex,
  ) {
    super(app, mcpPlugin)
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    // ── Section 1: MCP server ────────────────────────────────────────────────
    renderMcpServerSettings(this.mcpPlugin, containerEl, () => this.display())

    // ── Divider ──────────────────────────────────────────────────────────────
    containerEl.createEl('hr')
    containerEl.createEl('h2', { text: 'Workflow catalog' })

    // ── Section 2: Workflow catalog ──────────────────────────────────────────
    // renderCatalogSettings is async (needs to loadState). We fire-and-forget
    // via void; the inner render appends to containerEl once the promise
    // resolves, which is the same pattern CatalogSettingsTab already used.
    void renderCatalogSettings(
      this.app,
      this.mcpPlugin,
      this.fs,
      this.catalog,
      containerEl,
      this.catalogSearchTerm,
      (term) => {
        this.catalogSearchTerm = term
      },
      () => this.display(),
    )
  }
}
