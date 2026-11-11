// Restoring the windows of the previous session (`windows.json`) at startup.

import { classifyFolder } from '../fs/folderState'
import { openFolderAsWorkspace } from './openFolder'
import { allHosts, findWorkspaceByRoot, isDormant, targetHost, type Host } from './windowState'
import { readSavedWindows } from './windowsPersistence'
import { planRestore, skipOwnedRoots } from './windowsFile'
import { createWindow, destroyWorkspace } from './windows'

/** Deadline per folder: a hung network volume cannot keep the window from opening. */
const RESTORE_CHECK_TIMEOUT_MS = 2000

/** Removes from the bar the dormant workspaces whose folder vanished from disk (async check after restoring). */
async function dropMissingDormant(host: Host): Promise<void> {
  for (const ws of [...host.workspaces]) {
    const root = ws.root
    if (!root || !isDormant(ws)) continue
    // Only a vanished folder leaves the bar; file/no access/no answer stay (the error shows on activation). With a
    // deadline: a stalled volume cannot hold the check of the next dormant ones.
    if ((await classifyFolder(root, { timeoutMs: RESTORE_CHECK_TIMEOUT_MS })).state !== 'missing') continue
    // May have been activated/closed/replaced during the `await`; never removes the only workspace or the active one.
    if (host.closing || host.win.isDestroyed() || !host.workspaces.includes(ws)) continue
    if (ws.root !== root || !isDormant(ws) || host.activeId === ws.id || host.workspaces.length < 2) continue
    await destroyWorkspace(ws)
  }
}

let restoring: Promise<void> | null = null

/**
 * Recreates the windows of the last session (all tabs; only the active one of each window gets a view) and, if given,
 * opens the command line folder (activates the owner workspace or adds it to the target window). With nothing to
 * restore and no folder, opens an empty window.
 * Single-flight: `activate`/`second-instance` during the async check share the restore in progress; the `argvFolder`
 * of a second concurrent call is ignored. Today only startup passes a folder (forwards wait in `pendingForwards`
 * until `started`); whoever passes a folder later must use `openForwardedFolder`.
 */
export function restoreWindows(argvFolder: string | null): Promise<void> {
  restoring ??= doRestoreWindows(argvFolder).finally(() => {
    restoring = null
  })
  return restoring
}

async function doRestoreWindows(argvFolder: string | null): Promise<void> {
  // Async check (a hung network volume cannot freeze main): only the command line folder and the active workspace of
  // each window are awaited, since they need a view right away; the dormant ones are validated in the background
  // (`dropMissingDormant`), except when the active one vanished, in which case the whole window is checked.
  // Deadline exceeded: the folder did not vanish (maybe the volume is just slow), so the workspace is kept.
  const isAlive = async (root: string): Promise<boolean> => {
    const check = await classifyFolder(root, { timeoutMs: RESTORE_CHECK_TIMEOUT_MS })
    return check.state === 'dir' || check.timedOut === true
  }
  const [folder, saved] = await Promise.all([
    argvFolder
      ? classifyFolder(argvFolder, { timeoutMs: RESTORE_CHECK_TIMEOUT_MS }).then((c) =>
          c.state === 'dir' ? argvFolder : null
        )
      : null,
    Promise.all(
      readSavedWindows().map(async (w) => {
        const activeRoot = w.workspaces[w.active]?.root ?? null
        if (activeRoot === null || (await isAlive(activeRoot))) {
          return planRestore(w, () => true)
        }
        const roots = w.workspaces.map((ws) => ws.root).filter((root): root is string => root !== null)
        const alive = new Set(
          (await Promise.all(roots.map(async (root) => ((await isAlive(root)) ? root : null)))).filter(
            (r) => r !== null
          )
        )
        return planRestore(w, (root) => alive.has(root))
      })
    )
  ])
  for (const planned of saved) {
    // Another restore/open may have given the folder an owner during the `await`s: the folder is unique across
    // workspaces.
    const w = skipOwnedRoots(planned, (root) => findWorkspaceByRoot(root) !== null)
    if (!w) continue
    const host = createWindow({
      workspaces: w.workspaces,
      active: w.active,
      bounds: w.bounds,
      maximized: w.maximized
    })
    void dropMissingDormant(host)
  }
  if (folder) {
    if (allHosts().length === 0) createWindow({ root: folder })
    else openFolderAsWorkspace(folder, targetHost())
  } else if (allHosts().length === 0) {
    createWindow({ root: null })
  }
}
