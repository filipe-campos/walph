import { errorMessage } from './lib/errors'
import { notify } from './toasts'

interface AttemptOptions<F> {
  /** Builds the notification text from the error message (e.g. `t().claude.actions.failed`). */
  format?: (message: string) => string
  /** Value returned when `fn` fails. */
  fallback?: F
  /** No notification: `true`, or a function evaluated on failure (e.g. the folder changed while `fn` ran). */
  quiet?: boolean | ((err: unknown) => boolean)
  /** Runs on failure, before the notification (undo an optimistic update, clear state). */
  onError?: (err: unknown) => void
}

/** Runs `fn`; if it throws, notifies the error with `notify` and returns `fallback` (`undefined` when omitted). */
export async function attempt<T, F = undefined>(
  fn: () => T | Promise<T>,
  options: AttemptOptions<F> = {}
): Promise<Awaited<T> | F> {
  try {
    return await fn()
  } catch (err) {
    options.onError?.(err)
    const quiet = typeof options.quiet === 'function' ? options.quiet(err) : options.quiet
    if (!quiet) {
      const message = errorMessage(err)
      notify(options.format ? options.format(message) : message)
    }
    return options.fallback as F
  }
}
