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
  private countdownInterval?: ReturnType<typeof setInterval>

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

    // Friendly summary — prominent title-like text
    const summaryEl = contentEl.createEl('p')
    summaryEl.setText(this.req.summary)
    summaryEl.style.fontSize = '1.1em'
    summaryEl.style.fontWeight = 'bold'
    summaryEl.style.marginBottom = '0.5em'

    // Collapsed params block for developer inspection
    const details = contentEl.createEl('details')
    const summary = details.createEl('summary')
    summary.setText('Parameters (developer detail)')
    const pre = details.createEl('pre')
    pre.setText(JSON.stringify(this.req.params, null, 2))
    pre.style.fontSize = '0.85em'
    pre.style.overflowX = 'auto'

    // Countdown timer
    let remainingMs = this.req.timeoutMs
    const countdownEl = contentEl.createEl('p')
    countdownEl.setText(`Auto-denying in ${Math.ceil(remainingMs / 1000)}s…`)
    countdownEl.style.fontSize = '0.85em'
    countdownEl.style.color = 'var(--text-muted)'

    this.countdownInterval = setInterval(() => {
      remainingMs -= 1000
      if (remainingMs <= 0) {
        clearInterval(this.countdownInterval)
        this.countdownInterval = undefined
        countdownEl.setText('Auto-denying now…')
      } else {
        countdownEl.setText(`Auto-denying in ${Math.ceil(remainingMs / 1000)}s…`)
      }
    }, 1000)

    new Setting(contentEl)
      .addButton((b) =>
        b
          .setButtonText('Allow once')
          .setCta()
          .onClick(() => this.decide('allow')),
      )
      .addButton((b) =>
        b
          .setButtonText('Allow for session')
          .setTooltip(
            'Resets when MCP server restarts. Cleared on plugin reload, settings change, or catalog install.',
          )
          .onClick(() => this.decide('allow-session')),
      )
      .addButton((b) => b.setButtonText('Deny').onClick(() => this.decide('deny')))
  }

  onClose(): void {
    if (this.countdownInterval !== undefined) {
      clearInterval(this.countdownInterval)
      this.countdownInterval = undefined
    }
    if (!this.decided) this.resolve('deny')
    this.contentEl.empty()
  }

  private decide(v: 'allow' | 'allow-session' | 'deny'): void {
    this.decided = true
    this.resolve(v)
    this.close()
  }
}
