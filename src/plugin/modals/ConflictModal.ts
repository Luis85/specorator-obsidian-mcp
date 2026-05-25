import { type App, Modal } from 'obsidian'

export type ConflictChoice = 'overwrite' | 'backup' | 'skip'

export class ConflictModal extends Modal {
  constructor(
    app: App,
    private path: string,
    private onChoice: (c: ConflictChoice) => void,
  ) {
    super(app)
  }

  onOpen(): void {
    const { contentEl } = this
    contentEl.createEl('h3', { text: 'File already exists' })
    contentEl.createEl('p', {
      text: `A file at ${this.path} already exists and was not installed by this plugin. Choose how to proceed:`,
    })
    const choose = (c: ConflictChoice) => () => {
      this.onChoice(c)
      this.close()
    }
    const btnRow = contentEl.createEl('div')
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:8px;'

    const keepBtn = btnRow.createEl('button', { text: 'Keep mine (skip)' })
    keepBtn.classList.add('mod-cta')
    keepBtn.addEventListener('click', choose('skip'))

    btnRow
      .createEl('button', { text: 'Backup & replace' })
      .addEventListener('click', choose('backup'))

    const overwriteBtn = btnRow.createEl('button', { text: 'Overwrite' })
    overwriteBtn.classList.add('mod-warning')
    overwriteBtn.addEventListener('click', choose('overwrite'))
  }

  onClose(): void {
    this.contentEl.empty()
  }
}
