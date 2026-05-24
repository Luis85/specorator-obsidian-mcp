import type { NotificationPort } from '@/domain/ports'

type NoticeEntry = {
  severity: 'error' | 'warning' | 'success' | 'info'
  message: string
  durationMs: number
}

/**
 * In-memory {@link NotificationPort} for unit tests.
 */
export class MockNotificationPort implements NotificationPort {
  private readonly noticeLog: NoticeEntry[] = []

  showError(message: string, durationMs = 0): void {
    this.noticeLog.push({ severity: 'error', message, durationMs })
  }

  showWarning(message: string, durationMs = 8000): void {
    this.noticeLog.push({ severity: 'warning', message, durationMs })
  }

  showSuccess(message: string, durationMs = 4000): void {
    this.noticeLog.push({ severity: 'success', message, durationMs })
  }

  showInfo(message: string, durationMs = 4000): void {
    this.noticeLog.push({ severity: 'info', message, durationMs })
  }

  get notices(): readonly NoticeEntry[] {
    return [...this.noticeLog]
  }
}
