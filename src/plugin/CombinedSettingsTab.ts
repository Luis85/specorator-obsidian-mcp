import { App, PluginSettingTab } from 'obsidian'
import type SpecoratorMcpPlugin from './main'
import type { FileSystem, CatalogIndex } from '@/domain/catalog/types'
import { renderServerTab, renderPermissionsTab, renderAdvancedTab } from './settings'
import { renderCatalogSettings } from './CatalogSettingsTab'

type TabId = 'server' | 'permissions' | 'catalog' | 'advanced'

const TABS: { id: TabId; label: string }[] = [
  { id: 'server', label: 'Server' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'catalog', label: 'Catalog' },
  { id: 'advanced', label: 'Advanced' },
]

/**
 * Single Obsidian settings entry hosting four tabs: Server, Permissions,
 * Catalog, Advanced. Replaces the former single long scroll.
 */
export class CombinedSettingsTab extends PluginSettingTab {
  private activeTab: TabId = 'server'
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

    const bar = containerEl.createEl('div', { cls: 'specorator-settings-tabs' })
    bar.style.cssText =
      'display:flex;gap:4px;margin-bottom:16px;border-bottom:1px solid var(--background-modifier-border);'
    for (const tab of TABS) {
      const btn = bar.createEl('button', { text: tab.label })
      btn.style.cssText =
        'background:none;border:none;padding:8px 12px;cursor:pointer;border-bottom:2px solid transparent;'
      if (tab.id === this.activeTab) {
        btn.style.borderBottomColor = 'var(--interactive-accent)'
        btn.style.fontWeight = '600'
      }
      btn.onclick = () => {
        this.activeTab = tab.id
        this.display()
      }
    }

    const content = containerEl.createEl('div', { cls: 'specorator-settings-content' })

    switch (this.activeTab) {
      case 'server':
        renderServerTab(this.mcpPlugin, content, () => this.display())
        break
      case 'permissions':
        renderPermissionsTab(this.mcpPlugin, content, () => this.display(), this.fs)
        break
      case 'advanced':
        renderAdvancedTab(this.mcpPlugin, content)
        break
      case 'catalog':
        void renderCatalogSettings(
          this.app,
          this.mcpPlugin,
          this.fs,
          this.catalog,
          content,
          this.catalogSearchTerm,
          (term) => {
            this.catalogSearchTerm = term
          },
          () => this.display(),
        )
        break
    }
  }
}
