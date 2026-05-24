import { App, Modal, Setting } from 'obsidian'
import type { ConfirmModalPort, ConfirmModalRequest } from '@/domain/ports'

export class ObsidianConfirmModalAdapter implements ConfirmModalPort {
  constructor(private readonly app: App) {}

  confirm(req: ConfirmModalRequest): Promise<'allow' | 'allow-session' | 'deny'> {
    return new Promise((resolve) => {
      const modal = new ToolConfirmModal(this.app, req, resolve)
      modal.open()
    })
  }
}

class ToolConfirmModal extends Modal {
  private decided = false

  constructor(
    app: App,
    private readonly req: ConfirmModalRequest,
    private readonly resolve: (v: 'allow' | 'allow-session' | 'deny') => void,
  ) {
    super(app)
  }

  onOpen(): void {
    const { contentEl, titleEl } = this
    titleEl.setText(`MCP tool request: ${this.req.tool}`)

    contentEl.createEl('p', { text: this.req.summary })

    const pre = contentEl.createEl('pre')
    pre.setText(JSON.stringify(this.req.params, null, 2))

    new Setting(contentEl)
      .addButton((b) =>
        b
          .setButtonText('Allow once')
          .setCta()
          .onClick(() => this.decide('allow')),
      )
      .addButton((b) =>
        b.setButtonText('Allow for session').onClick(() => this.decide('allow-session')),
      )
      .addButton((b) =>
        b
          .setButtonText('Deny')
          .setWarning()
          .onClick(() => this.decide('deny')),
      )
  }

  onClose(): void {
    if (!this.decided) this.resolve('deny')
    this.contentEl.empty()
  }

  private decide(v: 'allow' | 'allow-session' | 'deny'): void {
    this.decided = true
    this.resolve(v)
    this.close()
  }
}
