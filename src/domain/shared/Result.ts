export type Result<T, E extends Error = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

export function err<E extends Error>(error: E): Result<never, E> {
  return { ok: false, error }
}

export function isOk<T, E extends Error>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok
}

export function isErr<T, E extends Error>(
  result: Result<T, E>,
): result is { ok: false; error: E } {
  return !result.ok
}
