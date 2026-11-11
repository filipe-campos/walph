// Auto update and shell command. Main decides when to check/download; here only the notification shows up.
import { updateToast } from './lib/updateToast'
import { attempt } from './attempt'
import { showToast } from './toasts'

const api = window.api

/** Shows each main notice as a toast with a fixed key. Returns the unsubscribe. */
export function watchUpdates(): () => void {
  return api.update.onNotice((notice) => showToast(updateToast(notice, { install: () => api.update.install() })))
}

export async function checkForUpdates(): Promise<void> {
  // The result arrives through `onNotice`.
  await attempt(() => api.update.check())
}

export async function installShellCommand(): Promise<void> {
  await attempt(async () => {
    const message = await api.cli.install()
    if (message !== null) showToast({ tone: 'done', title: message, duration: 4000 }) // null = cancelled
  })
}

export async function uninstallShellCommand(): Promise<void> {
  await attempt(async () => {
    const message = await api.cli.uninstall()
    if (message !== null) showToast({ tone: 'done', title: message, duration: 4000 }) // null = cancelled
  })
}
