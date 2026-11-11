import { basename } from 'node:path'
import { t } from '@shared/i18n'
import { UserError } from '../errors'

interface DescribeWriteOptions {
  /** Ready message per errno code; takes precedence over the default translations. */
  overrides?: Partial<Record<string, string>>
  /** Text for errors without a translation; without it `files.errors.writeFailed` applies with the original message. */
  fallback?: (name: string, message: string) => string
}

/** Translates common write errors (errno) into current-language messages; unknown ones become `writeFailed` with the
 * original message. */
export function describeWriteError(
  err: unknown,
  path: string,
  { overrides, fallback }: DescribeWriteOptions = {}
): UserError {
  if (err instanceof UserError) return err
  const code = (err as NodeJS.ErrnoException | null)?.code
  const name = basename(path)
  const override = code === undefined ? undefined : overrides?.[code]
  if (override !== undefined) return new UserError(override)
  switch (code) {
    case 'EACCES':
    case 'EPERM':
      return new UserError(t().files.errors.writeNoPermission(name))
    case 'ENOTDIR':
      return new UserError(t().files.errors.writeNotDirInPath(name))
    case 'EISDIR':
      return new UserError(t().files.errors.writeIsDir(name))
    case 'ENOSPC':
      return new UserError(t().files.errors.writeNoSpace(name))
    case 'EROFS':
      return new UserError(t().files.errors.writeReadOnly(name))
    default: {
      const detail = err instanceof Error ? err.message : String(err)
      return new UserError(fallback ? fallback(name, detail) : t().files.errors.writeFailed(name, detail))
    }
  }
}
