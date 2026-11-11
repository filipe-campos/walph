// Who may write what in `fs:writeFile`. The renderer only writes what main recognizes: a path inside the view
// folder or an outside file main read for this view (`fs:readText`: every file tab is born from it). Nothing the
// renderer sends creates a grant; see "Security" in the `main-ipc` skill.

import type { WebContents } from 'electron'
import { basename } from 'node:path'
import { t } from '@shared/i18n'
import { UserError } from '../errors'
import { getWindowRoot } from '../window/windows'
import { createViewPathAllowlist } from '../window/viewPathAllowlist'
import { resolveInsideRoot } from './paths'

// Memory safety cap; going past it only drops the tab opened longest ago.
const MAX_ALLOWED_PATHS = 10_000

const writable = createViewPathAllowlist('fs:writable', { maxEntries: MAX_ALLOWED_PATHS })

/**
 * Main just handed `path` to the view (read for the editor, save dialog): it may rewrite it. Inside the view folder
 * it is already allowed by the folder rule; registering would only spend the cap of the outside ones (e.g.
 * `settings.json`).
 */
export async function allowWrite(wc: WebContents, path: string): Promise<void> {
  if (await insideViewRoot(wc, path)) return
  await writable.allow(wc, path)
}

/** View folder switched: the grants were for the previous one. */
export function clearWriteAccess(wc: WebContents): void {
  writable.clear(wc)
}

async function insideViewRoot(wc: WebContents, path: string): Promise<boolean> {
  const root = getWindowRoot(wc)
  if (root === null) return false
  try {
    await resolveInsideRoot(root, path)
    return true
  } catch {
    return false
  }
}

/** Throws a translated `UserError` if the view cannot write `path`. */
export async function assertWritable(wc: WebContents, path: string): Promise<void> {
  if (await insideViewRoot(wc, path)) return
  const check = await writable.verify(wc, path)
  if (check === 'ok') return
  throw new UserError(
    check === 'changed'
      ? t().files.errors.writeTargetChanged(basename(path))
      : t().files.errors.writeNotAllowed(basename(path))
  )
}
