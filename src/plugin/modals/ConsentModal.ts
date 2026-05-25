import { type App, Modal, Setting } from 'obsidian'
import type { AssetMeta } from '@/domain/catalog/types'

export interface ConsentSummary {
  paths: string[]
  requires: string[]
  scanFlagged: boolean
  body: string
}

export function buildConsentSummary(
  asset: AssetMeta,
  paths: string[],
  scanFlagged: boolean,
): ConsentSummary {
  return { paths, requires: asset.requires, scanFlagged, body: asset.body }
}

export class ConsentModal extends Modal {
  constructor(
    app: App,
    private summary: ConsentSummary,
    private onConfirm: () => void,
  ) {
    super(app)
  }
  onOpen() {
    const { contentEl } = this
    contentEl.createEl('h3', { text: 'Install workflow asset?' })
    contentEl.createEl('p', { text: 'Files to write:' })
    const ul = contentEl.createEl('ul')
    this.summary.paths.forEach((p) => ul.createEl('li', { text: p }))
    if (this.summary.requires.length)
      contentEl.createEl('p', { text: 'Requires MCP tools: ' + this.summary.requires.join(', ') })
    if (this.summary.scanFlagged)
      contentEl.createEl('p', {
        text: '⚠ Content scan flagged this asset — review carefully.',
        cls: 'mod-warning',
      })
    contentEl.createEl('p', { text: 'Asset content (preview):' })
    const pre = contentEl.createEl('pre', { text: this.summary.body })
    pre.style.maxHeight = '240px'
    pre.style.overflowY = 'auto'
    new Setting(contentEl)
      .addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText('Confirm install')
          .setCta()
          .onClick(() => {
            this.onConfirm()
            this.close()
          }),
      )
  }
  onClose() {
    this.contentEl.empty()
  }
}
