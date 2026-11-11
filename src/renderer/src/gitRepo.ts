import { t } from '@shared/i18n'
import { get } from './store'
import { notify } from './toasts'

/** Folder of the open repository, or notifies and returns `null`. */
export function requireRepo(): string | null {
  const { root, git } = get()
  if (!root) {
    notify(t().git.view.openFolder)
    return null
  }
  if (!git?.isRepo) {
    notify(t().git.view.notARepo)
    return null
  }
  return root
}
