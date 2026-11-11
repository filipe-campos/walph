// Clone repository: main validates the URL, asks for the destination folder and runs `git clone`; this module holds
// the state of the running clone (store.clone), the toast with "Cancel" and opening the cloned folder as a workspace.
import type { CloneUrlCheck, GitCloneProgress } from '@shared/types'
import { t } from '@shared/i18n'
import { basename } from './lib/path'
import { get, set } from './store'
import { errorMessage } from './lib/errors'
import { addWorkspace } from './workspaceActions'
import { dismissToastByKey, notify, showToast, updateToastByKey } from './toasts'

const api = window.api

const TOAST_KEY = 'git:clone'

function describe(stage: string, percent: number | null): string {
  return percent === null ? `${stage}…` : `${stage} ${percent}%`
}

/** Wires main's progress to the store and the toast. Returns the unsubscribe. */
export function watchClone(): () => void {
  return api.git.onCloneProgress((p: GitCloneProgress) => {
    const current = get().clone
    // Progress of a clone this view already considers finished (cancelled/reloaded): ignore.
    if (!current || current.url !== p.url) return
    set({ clone: { ...current, destination: p.destination } })
    const title = t().git.clone.cloning(basename(p.destination) || current.name)
    if (current.destination === null) {
      // The 1st progress comes after the folder dialog: that is when the toast (with "Cancel") starts to make sense.
      showToast({
        key: TOAST_KEY,
        tone: 'info',
        title,
        description: describe(p.stage, p.percent),
        progress: p.percent,
        actions: [{ label: t().common.cancel, onClick: cancelClone }]
      })
    } else {
      updateToastByKey(TOAST_KEY, { title, description: describe(p.stage, p.percent), progress: p.percent })
    }
  })
}

function cancelClone(): void {
  if (!get().clone) return
  api.git.cancelClone()
}

/**
 * Clones `url` (already validated in the QuickInput) and opens the folder as a workspace. One at a time in this view.
 * `name` only serves the text before the first progress (main returns the real destination).
 */
export async function cloneRepository(url: string, name: string): Promise<void> {
  if (get().clone) return notify(t().git.clone.inProgress, 'info')
  set({ clone: { url, name, destination: null } })
  try {
    const destination = await api.git.clone(url)
    dismissToastByKey(TOAST_KEY)
    if (destination === null) {
      // Cancelling the folder dialog is not a notice; cancelling during the clone is.
      if (get().clone?.destination) notify(t().git.clone.cancelled, 'info')
      return
    }
    showToast({ tone: 'done', title: t().git.clone.cloned(basename(destination)), duration: 4000 })
    await addWorkspace(destination)
  } catch (err) {
    dismissToastByKey(TOAST_KEY)
    notify(errorMessage(err))
  } finally {
    set({ clone: null })
  }
}

/** Validates the clone URL in main (without running anything): the picker shows the error or the folder name. */
export function checkCloneUrl(url: string): Promise<CloneUrlCheck> {
  return api.git.checkCloneUrl(url)
}
