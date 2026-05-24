import type { LoggerPort } from '@/domain/ports'

type LogEntry = {
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  error?: unknown
  context?: Record<string, unknown>
}

/**
 * In-memory {@link LoggerPort} for unit tests.
 */
export class MockLoggerPort implements LoggerPort {
  private readonly _logEntries: LogEntry[] = []

  get logEntries(): readonly LogEntry[] {
    return [...this._logEntries]
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this._logEntries.push({ level: 'debug', message, context })
  }

  info(message: string, context?: Record<string, unknown>): void {
    this._logEntries.push({ level: 'info', message, context })
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this._logEntries.push({ level: 'warn', message, context })
  }

  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    this._logEntries.push({ level: 'error', message, error, context })
  }
}
