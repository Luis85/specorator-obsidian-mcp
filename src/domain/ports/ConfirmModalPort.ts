/**
 * Narrow port that renders a 3-choice confirmation modal so trust-first
 * permission gates are testable without Obsidian.
 *
 * Implementations live in `src/infrastructure/`:
 * - `ObsidianConfirmModal` wraps an Obsidian `Modal` subclass (production).
 * - `MockConfirmModalPort` is a field-driven test double.
 *
 * Domain layer — must not import `obsidian`.
 */
export interface ConfirmModalRequest {
  tool: string
  params: Record<string, unknown>
  summary: string
  /** Milliseconds until modal auto-denies. Populated by PermissionGate.ask. */
  timeoutMs: number
  /** Full file content at the time of the request, for future diff-preview use. Optional. */
  currentContent?: string
}

export type ConfirmModalChoice = 'allow' | 'allow-session' | 'deny'

export interface ConfirmModalPort {
  /**
   * Renders a modal 3-choice prompt; resolves to the user's choice.
   * Never throws. Returns 'deny' on Escape / dismiss.
   */
  confirm(req: ConfirmModalRequest): Promise<ConfirmModalChoice>
}
