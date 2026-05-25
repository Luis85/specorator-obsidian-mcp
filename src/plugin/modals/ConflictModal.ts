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
    contentEl.createEl('p', { text: this.path })
    const choose = (c: ConflictChoice) => () => {
      this.onChoice(c)
      this.close()
    }
    contentEl
      .createEl('button', { text: 'Keep mine (skip)' })
      .addEventListener('click', choose('skip'))
    contentEl
      .createEl('button', { text: 'Backup & replace' })
      .addEventListener('click', choose('backup'))
    contentEl
      .createEl('button', { text: 'Overwrite' })
      .addEventListener('click', choose('overwrite'))
  }

  onClose(): void {
    this.contentEl.empty()
  }
}
