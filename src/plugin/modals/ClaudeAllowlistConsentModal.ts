import { type App, Modal } from 'obsidian'
import type { FileSystem } from '@/domain/catalog/types'
import { detectSyncedVault } from './HookConsentModal'

/**
 * Confirms before writing the Claude Code allowlist into `.claude/settings.json`.
 * Shows the target path, the tool ids to be added, and a synced-vault warning.
 */
export class ClaudeAllowlistConsentModal extends Modal {
  constructor(
    private readonly fs: FileSystem,
    app: App,
    private readonly targetPath: string,
    private readonly toolIds: string[],
    private readonly onConfirm: () => void,
  ) {
    super(app)
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this
    contentEl.createEl('h3', { text: 'Generate Claude Code allowlist' })
    contentEl.createEl('p', {
      text: `This merges ${this.toolIds.length} read + safe-write tools into ${this.targetPath} so Claude Code stops prompting for them. Existing entries are preserved.`,
    })
    const pre = contentEl.createEl('pre', { text: this.toolIds.join('\n') })
    pre.style.maxHeight = '240px'
    pre.style.overflowY = 'auto'

    const sync = await detectSyncedVault(this.fs)
    if (sync !== null) {
      contentEl.createEl('p', {
        text: `This vault appears to be under ${sync}. Writing .claude/settings.json will propagate to every machine/collaborator that syncs this vault.`,
        cls: 'mod-warning',
      })
    }

    const btnRow = contentEl.createEl('div')
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:8px;'
    const cancelBtn = btnRow.createEl('button', { text: 'Cancel' })
    cancelBtn.addEventListener('click', () => this.close())
    const confirmBtn = btnRow.createEl('button', { text: 'Write allowlist' })
    confirmBtn.classList.add('mod-cta')
    confirmBtn.addEventListener('click', () => {
      this.onConfirm()
      this.close()
    })
  }

  onClose(): void {
    this.contentEl.empty()
  }
}
