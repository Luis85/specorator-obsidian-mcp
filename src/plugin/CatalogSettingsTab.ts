import {
  type App,
  type Plugin,
  Platform as ObsidianPlatform,
  PluginSettingTab,
  Setting,
  Notice,
} from 'obsidian'
import type { CatalogIndex, AssetMeta, FileSystem, InstalledState } from '@/domain/catalog/types'
import type { Platform } from '@/domain/catalog/types'
import { enableAsset, disableAsset, updateAsset } from '@/application/catalog/installer'
import type { ConflictChoice } from '@/application/catalog/installer'
import { loadState } from '@/application/catalog/sidecar'
import { scanForInjection } from '@/application/catalog/scanner'
import { targetPath, supportedPlatforms } from '@/application/catalog/platforms'
import { buildConsentSummary, ConsentModal } from './modals/ConsentModal'
import { ConflictModal } from './modals/ConflictModal'
import { partitionTools } from '@/application/catalog/policy'
import { detectUpdates } from '@/application/catalog/update'

/** B7: default platform selection so multi-platform emit is reachable immediately. */
export const DEFAULT_PLATFORMS: Platform[] = ['claude']
export const ALL_PLATFORMS: Platform[] = ['claude', 'cursor', 'codex', 'gemini']

export interface BadgeState {
  installed: boolean
  requiresOk: boolean
  denied?: boolean // a required tool is present but in `deny` mode (v0.1.0)
  conflict?: boolean // untracked file occupies a target path
  installedHash?: string // hash recorded at install time
  catalogHash?: string // hash of the current catalog body
}

export function computeBadge(s: BadgeState): string {
  if (s.installed) {
    if (
      s.installedHash !== undefined &&
      s.catalogHash !== undefined &&
      s.installedHash !== s.catalogHash
    )
      return 'Update available'
    return 'Enabled'
  }
  if (s.conflict === true) return 'Conflict'
  if (s.denied === true) return 'Needs tool (denied)'
  if (!s.requiresOk) return 'Needs tool'
  return 'Available'
}

// Plugin settings interface — plugin must expose this shape
interface PluginWithSettings extends Plugin {
  settings: {
    platforms?: Platform[]
    [key: string]: unknown
  }
  saveSettings(): Promise<void>
}

// ── Shared render helpers (module-private) ─────────────────────────────────────

function onConflict(app: App, path: string): Promise<ConflictChoice> {
  return new Promise<ConflictChoice>((resolve) => {
    new ConflictModal(app, path, resolve).open()
  })
}

function renderUpdateHeader(
  app: App,
  containerEl: HTMLElement,
  outdatedIds: string[],
  currentPlatforms: Platform[],
  fs: FileSystem,
  catalog: CatalogIndex,
  onRefresh: () => void,
): void {
  if (outdatedIds.length === 0) return
  new Setting(containerEl)
    .setName(`Update available (${outdatedIds.length.toString()})`)
    .setDesc('Newer versions of installed assets are bundled.')
    .addButton((b) =>
      b
        .setButtonText('Update all')
        .setCta()
        .onClick(() => {
          void handleBulkUpdate(app, fs, catalog, outdatedIds, currentPlatforms, onRefresh)
        }),
    )
    .addButton((b) =>
      b.setButtonText('Clean up backups').onClick(() => {
        handleCleanupBackups()
      }),
    )
}

function renderBundleRows(
  app: App,
  containerEl: HTMLElement,
  catalog: CatalogIndex,
  fs: FileSystem,
  state: InstalledState,
  currentPlatforms: Platform[],
  outdatedIds: string[],
  searchFilter: string,
  onRefresh: () => void,
): void {
  const bundles = new Map<string, AssetMeta[]>()
  for (const a of catalog.assets) {
    if (!bundles.has(a.bundle)) bundles.set(a.bundle, [])
    bundles.get(a.bundle)!.push(a)
  }

  for (const [bundle, assets] of bundles) {
    const filtered = assets.filter(
      (a) =>
        searchFilter === '' ||
        a.name.toLowerCase().includes(searchFilter) ||
        a.description.toLowerCase().includes(searchFilter),
    )
    if (filtered.length === 0) continue

    const header = new Setting(containerEl).setName(bundle).setHeading()
    header.addButton((b) => {
      b.setButtonText('Enable all').onClick(() => {
        handleEnableAll(
          app,
          fs,
          catalog,
          bundle,
          filtered,
          assets,
          state,
          currentPlatforms,
          onRefresh,
        )
      })
    })

    for (const asset of filtered) {
      renderAssetRow(
        app,
        containerEl,
        fs,
        catalog,
        asset,
        state,
        currentPlatforms,
        outdatedIds,
        onRefresh,
      )
    }
  }
}

function renderAssetRow(
  app: App,
  containerEl: HTMLElement,
  fs: FileSystem,
  catalog: CatalogIndex,
  asset: AssetMeta,
  state: InstalledState,
  currentPlatforms: Platform[],
  outdatedIds: string[],
  onRefresh: () => void,
): void {
  const installed = Object.hasOwn(state, asset.id)
  const { destructive: destructiveReqs } = partitionTools(asset.requires)
  const badgeState: BadgeState = {
    installed,
    requiresOk: destructiveReqs.length < asset.requires.length || asset.requires.length === 0,
    installedHash: installed ? state[asset.id].hash : undefined,
  }
  const badgeText = computeBadge(badgeState)

  const row = new Setting(containerEl)
    .setName(asset.name)
    .setDesc(asset.description)
    .addToggle((t) =>
      t.setValue(installed).onChange((value) => {
        void handleToggle(app, fs, catalog, currentPlatforms, asset, value, onRefresh)
      }),
    )
  if (outdatedIds.includes(asset.id)) {
    row.addExtraButton((b) =>
      b
        .setIcon('refresh-cw')
        .setTooltip('Update this asset')
        .onClick(() => {
          void handleBulkUpdate(app, fs, catalog, [asset.id], currentPlatforms, onRefresh)
        }),
    )
  }
  row.then((s) => {
    s.nameEl.createSpan({ text: ` [${badgeText}]`, cls: 'catalog-badge' })
  })
}

function handleEnableAll(
  app: App,
  fs: FileSystem,
  catalog: CatalogIndex,
  bundle: string,
  filtered: AssetMeta[],
  assets: AssetMeta[],
  state: InstalledState,
  currentPlatforms: Platform[],
  onRefresh: () => void,
): void {
  const notInstalled = filtered.filter((a) => !Object.hasOwn(state, a.id))
  const destructiveTools = notInstalled.flatMap((a) => partitionTools(a.requires).destructive)
  const allPaths = notInstalled.flatMap((a) =>
    currentPlatforms
      .filter((p) => supportedPlatforms(a).includes(p))
      .flatMap((p) => {
        try {
          return [targetPath(a, p)]
        } catch {
          return []
        }
      }),
  )
  // assets is always non-empty (populated from bundles map); notInstalled[0] falls back to it.
  const firstAsset = notInstalled[0] ?? assets[0]
  const summary = buildConsentSummary(
    firstAsset,
    allPaths,
    notInstalled.some((a) => scanForInjection(a.body).flagged),
  )
  if (destructiveTools.length > 0) {
    summary.body = `Destructive tools: ${destructiveTools.join(', ')}\n\n${summary.body}`
  }
  new ConsentModal(app, summary, () => {
    void (async () => {
      try {
        for (const a of notInstalled) {
          await enableAsset(fs, a, catalog.assets, currentPlatforms, {
            onConflict: (p) => onConflict(app, p),
            onUserModified: (p) => onConflict(app, p),
          })
        }
        new Notice(`Enabled ${notInstalled.length} asset(s) in ${bundle}`)
      } catch (e) {
        new Notice(`Failed: ${(e as Error).message}`)
      }
      onRefresh()
    })()
  }).open()
}

async function handleToggle(
  app: App,
  fs: FileSystem,
  catalog: CatalogIndex,
  currentPlatforms: Platform[],
  asset: AssetMeta,
  value: boolean,
  onRefresh: () => void,
): Promise<void> {
  try {
    if (value) {
      const scan = scanForInjection(asset.body)
      const paths = currentPlatforms
        .filter((p) => supportedPlatforms(asset).includes(p))
        .flatMap((p) => {
          try {
            return [targetPath(asset, p)]
          } catch {
            return []
          }
        })
      const summary = buildConsentSummary(asset, paths, scan.flagged)
      new ConsentModal(app, summary, () => {
        void enableAsset(fs, asset, catalog.assets, currentPlatforms, {
          onConflict: (p) => onConflict(app, p),
          onUserModified: (p) => onConflict(app, p),
        })
          .then(() => {
            new Notice(`Installed ${asset.name}`)
          })
          .catch((e: unknown) => {
            new Notice(`Failed: ${(e as Error).message}`)
          })
          .finally(() => {
            onRefresh()
          })
      }).open()
    } else {
      await disableAsset(fs, asset.id)
      new Notice(`Removed ${asset.name}`)
      onRefresh()
    }
  } catch (e) {
    new Notice(`Failed: ${(e as Error).message}`)
    onRefresh()
  }
}

// Phase 3: bulk update — run updateAsset for each outdated id
async function handleBulkUpdate(
  app: App,
  fs: FileSystem,
  catalog: CatalogIndex,
  ids: string[],
  platforms: Platform[],
  onRefresh: () => void,
  enableHooks = false,
): Promise<void> {
  const warn = (m: string) => {
    new Notice(m)
  }
  let updated = 0
  for (const id of ids) {
    const asset = catalog.assets.find((a) => a.id === id)
    if (asset === undefined) continue
    try {
      await updateAsset(fs, asset, catalog.assets, platforms, {
        enableHooks,
        warn,
        onConflict: (p) => onConflict(app, p),
        onUserModified: (p) => onConflict(app, p),
      })
      updated++
    } catch (e) {
      new Notice(`Failed to update ${id}: ${(e as Error).message}`)
    }
  }
  if (updated > 0) new Notice(`Updated ${updated.toString()} asset(s)`)
  onRefresh()
}

// Phase 3: clean up .bak files — surface guidance (no glob API available).
function handleCleanupBackups(): void {
  new Notice('Backup files are named *.bak in your vault. Remove them via your file manager.')
}

// ── Public free function ───────────────────────────────────────────────────────

/**
 * Render the Workflow Catalog settings into `containerEl`.
 *
 * @param searchTerm   - current search filter value (instance-owned state)
 * @param onSearchChange - called when the user changes the search term
 * @param onRefresh    - called when any action requires a full re-render
 */
export async function renderCatalogSettings(
  app: App,
  plugin: Plugin,
  fs: FileSystem,
  catalog: CatalogIndex,
  containerEl: HTMLElement,
  searchTerm: string,
  onSearchChange: (term: string) => void,
  onRefresh: () => void,
): Promise<void> {
  const pw = plugin as PluginWithSettings

  let emptyPlatformWarningEl: HTMLElement | null = null

  const getPlatforms = (): Platform[] => {
    const p = pw.settings.platforms
    if (p !== undefined && p.length > 0) {
      emptyPlatformWarningEl?.remove()
      emptyPlatformWarningEl = null
      return p
    }
    return DEFAULT_PLATFORMS
  }

  // Desktop-only guard (Medium): installer writes outside-vault config dirs
  if (!ObsidianPlatform.isDesktopApp) {
    containerEl.createEl('p', {
      text:
        'The Workflow Catalog installer is desktop-only — it writes agent ' +
        'config files (.claude/, .cursor/, .gemini/, .agents/) into your vault folder.',
    })
    return
  }

  // B7: platform-selection multi-select. One Setting row per platform so each
  // label is visible (not behind an on-hover tooltip).
  const PLATFORM_LABELS: Record<Platform, { name: string; desc: string }> = {
    claude: {
      name: 'Claude Code',
      desc: 'Install to .claude/skills, .claude/commands, .claude/agents, .claude/hooks',
    },
    cursor: {
      name: 'Cursor',
      desc: 'Install to .cursor/skills, .cursor/commands, .cursor/agents',
    },
    codex: {
      name: 'Codex CLI',
      desc: 'Install skills to .agents/skills (Codex commands are global; not emitted)',
    },
    gemini: {
      name: 'Gemini CLI',
      desc: 'Install to .gemini/extensions/specorator/{skills,commands} with extension manifest',
    },
  }
  new Setting(containerEl).setName('Target platforms').setHeading()
  const selected = new Set<Platform>(getPlatforms())

  // Render (or update) the empty-platform warning paragraph.
  const renderEmptyPlatformWarning = (): void => {
    if (selected.size === 0) {
      if (emptyPlatformWarningEl === null) {
        emptyPlatformWarningEl = containerEl.createEl('p', {
          text: 'No platforms selected — Claude Code is used as fallback. Toggle at least one platform above to choose explicitly.',
          cls: 'mod-warning',
        })
      }
    } else {
      emptyPlatformWarningEl?.remove()
      emptyPlatformWarningEl = null
    }
  }

  for (const p of ALL_PLATFORMS) {
    const labels = PLATFORM_LABELS[p]
    new Setting(containerEl)
      .setName(labels.name)
      .setDesc(labels.desc)
      .addToggle((t) =>
        t.setValue(selected.has(p)).onChange(async (on) => {
          if (on) selected.add(p)
          else selected.delete(p)
          pw.settings.platforms = [...selected]
          await pw.saveSettings()
          renderEmptyPlatformWarning()
        }),
      )
  }

  // Show warning immediately if already empty on first render.
  renderEmptyPlatformWarning()

  // Fix 3 (PR #444 P2): search filter is stored on the instance so it
  // survives the display() rerender triggered by toggle/update actions.
  new Setting(containerEl).addSearch((s) => {
    s.setPlaceholder('Search assets...')
      .setValue(searchTerm)
      .onChange((v) => {
        onSearchChange(v.toLowerCase())
        onRefresh()
      })
  })

  const state = await loadState(fs)
  const currentPlatforms = getPlatforms()

  // Phase 3: show "Update available (N)" header + bulk-update button.
  const outdatedIds = detectUpdates(state, catalog.assets)
  renderUpdateHeader(app, containerEl, outdatedIds, currentPlatforms, fs, catalog, onRefresh)
  renderBundleRows(
    app,
    containerEl,
    catalog,
    fs,
    state,
    currentPlatforms,
    outdatedIds,
    searchTerm,
    onRefresh,
  )
}

// ── PluginSettingTab subclass (kept; tests import computeBadge/DEFAULT_PLATFORMS from this file) ──

export class CatalogSettingsTab extends PluginSettingTab {
  // Fix 3 (PR #444 P2): persist the search term across display() rerenders so
  // toggling an asset does not reset the filter the user typed.
  private searchTerm = ''

  constructor(
    app: App,
    private readonly _plugin: Plugin,
    private fs: FileSystem,
    private catalog: CatalogIndex,
  ) {
    super(app, _plugin)
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()
    new Setting(containerEl).setName('Workflow catalog').setHeading()
    void renderCatalogSettings(
      this.app,
      this._plugin,
      this.fs,
      this.catalog,
      containerEl,
      this.searchTerm,
      (term) => {
        this.searchTerm = term
      },
      () => this.display(),
    )
  }
}

/** Register the specorator:update-catalog-assets command (BRAT pattern).
 *  Called from the plugin's onload() after the settings tab is constructed. */
export function registerUpdateCommand(
  plugin: Plugin & {
    addCommand: (cmd: { id: string; name: string; callback: () => void }) => void
  },
  fs: FileSystem,
  catalog: CatalogIndex,
  getPlatforms: () => Platform[],
): void {
  plugin.addCommand({
    id: 'update-catalog-assets',
    name: 'Update catalog assets',
    callback: () => {
      void (async () => {
        try {
          const state = await loadState(fs)
          const outdated = detectUpdates(state, catalog.assets)
          if (outdated.length === 0) {
            new Notice('All catalog assets are up to date.')
            return
          }
          const platforms = getPlatforms()
          for (const id of outdated) {
            const asset = catalog.assets.find((a) => a.id === id)
            if (!asset) continue
            await updateAsset(fs, asset, catalog.assets, platforms, {
              warn: (m: string) => {
                new Notice(m)
              },
            })
          }
          new Notice(`Updated ${outdated.length.toString()} catalog asset(s).`)
        } catch (e) {
          new Notice(`Catalog update failed: ${(e as Error).message}`)
        }
      })()
    },
  })
}
