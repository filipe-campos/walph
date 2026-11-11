import { isNonEmptyString } from '@shared/guards'
import { isAbsolute, resolve } from 'node:path'
import { t } from '@shared/i18n'
import { UserError } from '../errors'

/** Absolute text without a null byte (which Node rejects confusingly). For channels that ignore invalid input. */
export function isAbsolutePathInput(value: unknown): value is string {
  return isNonEmptyString(value) && !value.includes('\0') && isAbsolute(value)
}

/** Absolute path from the renderer, returned as it came. */
export function assertAbsolutePath(value: unknown): string {
  if (!isAbsolutePathInput(value)) throw new UserError(t().files.errors.absolutePathRequired)
  return value
}

/** Like `assertAbsolutePath`, but returns the normalized path (`resolve`) and accepts the domain message. */
export function parseAbsolutePath(value: unknown, message?: string): string {
  if (!isAbsolutePathInput(value)) throw new UserError(message ?? t().files.errors.absolutePathRequired)
  return resolve(value)
}

/** File/folder name typed in the UI: no separators, `.` or `..`. */
export function assertValidName(value: unknown): string {
  if (!isNonEmptyString(value) || value === '.' || value === '..' || /[\\/\0]/.test(value)) {
    throw new UserError(t().files.errors.invalidName(String(value)))
  }
  return value
}
