// Pure logic of the welcome screen recents: multiple selection, button label and open workspace.
import { t } from '@shared/i18n'
import type { RecentFolder, WorkspaceInfo } from '@shared/types'
import { samePath } from './path'
import { relativeAge } from './relativeTime'

/** Selection that still exists in the list (a removed recent leaves by itself), in the order it was made. */
export function visibleSelection(selected: readonly string[], folders: readonly RecentFolder[]): string[] {
  return selected.filter((p) => folders.some((f) => f.path === p))
}

/** Text of the main button: "Abrir todos" without a selection, else "Abrir N workspaces". */
export function openButtonLabel(count: number): string {
  const m = t().app.welcome
  return count === 0 ? m.openAll : m.openCount(count)
}

/** "aberto há 2 h"; an old entry without a date shows nothing. */
export function openedAgo(lastOpened: number | null, now: number = Date.now()): string | null {
  if (lastOpened === null) return null
  const age = relativeAge(lastOpened, now)
  const m = t().app.recent.opened
  switch (age.kind) {
    case 'now':
      return m.now
    case 'minutes':
      return m.minutesAgo(age.n)
    case 'hours':
      return m.hoursAgo(age.n)
    case 'yesterday':
      return m.yesterday
    case 'days':
      return m.daysAgo(age.n)
    case 'date':
      return m.on(age.date)
  }
}

/** Workspace of this window that already has `path` open (live, not dormant), to show the Claude dot. */
export function openWorkspaceOf(
  list: readonly WorkspaceInfo[] | null | undefined,
  path: string,
  platform: string
): WorkspaceInfo | null {
  return list?.find((w) => !w.dormant && w.root !== null && samePath(w.root, path, platform)) ?? null
}

/** Folders highlighted on the home screen: the most recent first (main's list already comes sorted), at most `max`. */
export function highlightFolders(folders: readonly RecentFolder[], max = 4): RecentFolder[] {
  return folders.slice(0, Math.max(0, max))
}
