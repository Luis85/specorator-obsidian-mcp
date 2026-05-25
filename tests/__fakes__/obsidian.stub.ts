/**
 * Vitest stub for the `obsidian` package, which ships only `.d.ts` files in
 * node_modules and has no runtime outside the Obsidian app itself. This stub
 * is wired in via `vitest.config.ts` alias so that tests can exercise the
 * real `ObsidianBridge` (or any other source file that imports from
 * `'obsidian'`) without crashing Vite's import-analysis pass.
 *
 * The stub implements just enough surface for `ObsidianBridge`:
 *   - `normalizePath` — matches Obsidian's behaviour for the cases this stub
 *     exercises (backslashes to forward slashes, collapse runs of slashes,
 *     strip leading + trailing slashes). Does NOT implement Obsidian's NBSP
 *     replacement, Unicode NFC normalisation, or the empty-path → '/' case.
 *   - `Notice`, `TFile`, `TFolder` — empty classes so `instanceof` checks
 *     work and tests can construct sentinel instances.
 *
 * Individual tests that need richer behaviour can override entries with
 * `vi.mock('obsidian', () => ({ ... }))`.
 */

export function normalizePath(path: string): string {
  let p = path.replace(/\\/g, '/').replace(/\/+/g, '/')
  if (p.startsWith('/')) p = p.slice(1)
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return p
}

export class Notice {
  noticeEl = { addEventListener: () => {} }
  constructor(_msg: string, _ms?: number) {}
  hide(): void {}
}

export class TFile {
  path = ''
  basename = ''
  extension = ''
}

export class TFolder {
  children: unknown[] = []
  name = ''
}

/**
 * Minimal stand-in for the desktop-only `FileSystemAdapter`. Tests can
 * construct an instance and override `getBasePath()` per case; production
 * code only relies on `instanceof FileSystemAdapter` + `getBasePath()`.
 */
export class FileSystemAdapter {
  getBasePath(): string {
    return ''
  }
}

export function setIcon(_el: HTMLElement, _name: string): void {
  // No-op stub; tests that care assert on bridge behaviour, not Obsidian's
  // icon DOM.
}

export type App = unknown

export class Modal {
  contentEl: HTMLElement = {
    createEl: (_tag: string, _opts?: unknown) =>
      ({ addEventListener: () => {}, createEl: () => ({}) }) as unknown as HTMLElement,
    empty: () => {},
  } as unknown as HTMLElement
  constructor(_app: unknown) {}
  open(): void {}
  close(): void {}
  onOpen(): void {}
  onClose(): void {}
}

export class PluginSettingTab {
  containerEl: HTMLElement = {
    empty: () => {},
    createEl: (_tag: string, _opts?: unknown) => ({}) as HTMLElement,
  } as unknown as HTMLElement
  constructor(_app: unknown, _plugin: unknown) {}
  display(): void {}
  hide(): void {}
}

export class Setting {
  constructor(_containerEl: unknown) {}
  setName(_name: string): this {
    return this
  }
  setDesc(_desc: string): this {
    return this
  }
  setHeading(): this {
    return this
  }
  addToggle(
    _cb: (t: { setValue(v: boolean): { onChange(cb: (v: boolean) => unknown): unknown } }) => void,
  ): this {
    return this
  }
}

export class Plugin {
  app: unknown = {}
  addSettingTab(_tab: unknown): void {}
  addCommand(_cmd: unknown): void {}
  registerView(_type: string, _factory: unknown): void {}
  addRibbonIcon(_icon: string, _title: string, _cb: unknown): unknown {
    return {}
  }
}
