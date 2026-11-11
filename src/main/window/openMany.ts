import type { Host } from './windows'
import { addWorkspace, findWorkspaceByRoot, lastFolderList } from './windows'
import { openFolderAsWorkspace } from './openFolder'
import { samePath } from '@shared/pathCompare'
import { t } from '@shared/i18n'
import { classifyFolder } from '../fs/folderState'
import { parseAbsolutePath } from '../fs/validate'
import { getRecent, removeRecentFolder } from '../recent/store'
import { UserError } from '../errors'

// Limits on what the renderer can request at once.
const MAX_OPEN_MANY = 20
const MAX_OPEN_ALL_RECENT = 9

// Hosts with an `openMany` in progress.
const openingMany = new WeakSet<Host>()

function validRoots(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length > MAX_OPEN_MANY) throw new UserError(t().app.errors.invalidFolderList)
  const roots: string[] = []
  for (const item of raw) {
    roots.push(parseAbsolutePath(item, t().app.errors.invalidFolder))
  }
  return roots
}

/** "Open all": the last folder list of the window; without it, the recent ones (up to 9). */
function defaultRoots(host: Host): string[] {
  const last = lastFolderList(host)
  return last.length > 0
    ? last
    : getRecent()
        .slice(0, MAX_OPEN_ALL_RECENT)
        .map((f) => f.path)
}

async function openMany(host: Host, rawRoots: unknown): Promise<number> {
  const wanted = rawRoots === undefined || rawRoots === null ? defaultRoots(host) : validRoots(rawRoots)
  // No duplicates: the folder that just reused the empty view only becomes owner when the renderer opens it.
  const roots = wanted.filter((root, i) => wanted.findIndex((other) => samePath(other, root)) === i)
  let opened = 0
  let activated = false
  // A function, not a direct read: TS does not invalidate the narrowing of `host.closing` across the loop's `await`s.
  const hostGone = (): boolean => host.closing || host.win.isDestroyed()
  for (const root of roots) {
    if (hostGone()) break
    // Already open in any workspace: skipped, without bringing the owner to the front.
    if (findWorkspaceByRoot(root)) continue
    const { state } = await classifyFolder(root)
    if (state === 'missing') removeRecentFolder(root)
    if (state !== 'dir') continue
    // During the `await`s the sender's window may have closed, or another request may have opened the same folder.
    if (findWorkspaceByRoot(root)) continue
    const target = hostGone() ? null : host
    if (!activated || !target) {
      // The first folder takes the empty view or becomes the active tab (a single view starts).
      if (openFolderAsWorkspace(root, target)) {
        opened++
        activated = true
      }
    } else {
      // The rest join the bar as dormant (with the last known branch) and only load when activated: opening N
      // renderers at once froze the machine.
      const branch = getRecent().find((f) => samePath(f.path, root))?.branch ?? null
      addWorkspace(target, root, branch)
      opened++
    }
  }
  return opened
}

/** Opens several folders as workspaces; `0` if the window already has a request in progress (double click). */
export async function openManyFolders(host: Host, rawRoots: unknown): Promise<number> {
  if (openingMany.has(host)) return 0
  openingMany.add(host)
  try {
    return await openMany(host, rawRoots)
  } finally {
    openingMany.delete(host)
  }
}
