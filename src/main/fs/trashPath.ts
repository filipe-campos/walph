import { shell } from 'electron'
import { basename } from 'node:path'
import { t } from '@shared/i18n'
import { UserError } from '../errors'

/** System trash (reversible); the OS refusal (permission, volume without trash) becomes a translated message. */
export async function trashPath(path: string): Promise<void> {
  try {
    await shell.trashItem(path)
  } catch (err) {
    throw new UserError(
      t().files.errors.trashFailed(basename(path), err instanceof Error ? err.message : String(err)),
      {
        cause: err
      }
    )
  }
}
