/**
 * Surfaces transient user-visible notices, typed by severity.
 * Default durations: error 0 (sticky), warning 8000ms, success/info 4000ms.
 */
export interface NotificationPort {
  showError(message: string, durationMs?: number): void
  showWarning(message: string, durationMs?: number): void
  showSuccess(message: string, durationMs?: number): void
  showInfo(message: string, durationMs?: number): void
}
