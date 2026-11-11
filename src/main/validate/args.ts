// Combinators for arguments coming from the renderer (untrusted). Each one receives the already translated message from
// the caller (`t()` at call time) and throws `UserError` with it. Absolute paths: `fs/validate.ts`.
import { isRecord } from '@shared/guards'
import { UserError } from '../errors'

/** Integer in `[min, max]` (optional bounds). */
export function int(value: unknown, range: { min?: number; max?: number }, message: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    (range.min !== undefined && value < range.min) ||
    (range.max !== undefined && value > range.max)
  ) {
    throw new UserError(message)
  }
  return value
}

/** One of the allowed values (strict comparison). */
export function oneOf<const T extends string>(value: unknown, allowed: readonly T[], message: string): T {
  const found = allowed.find((candidate) => candidate === value)
  if (found === undefined) throw new UserError(message)
  return found
}

/** Only `true` counts as true; anything else is `false`. */
export const bool = (value: unknown): boolean => value === true

/** The received object, or `{}` when it is not one. */
export function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}
