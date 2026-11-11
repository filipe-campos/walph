// Pure logic of the WorkspaceBar: navigation between tabs, order when dragging, branch reported to main and which
// notices of inactive workspaces still count.
import { t } from '@shared/i18n'
import { capCount } from './capCount'
import { basename, dirname } from './path'
import type { GitStatus, WorkspaceId, WorkspaceInfo, WorkspacesState } from '@shared/types'

/** Prefix of the keys of the notices main sends about inactive workspaces (`notifications:show`). */
export const NOTICE_KEY_PREFIX = 'ws:'

/**
 * This view is the visible one of the window. Without state yet (or a window without a new main) counts as active:
 * nothing is hidden.
 */
export function isViewActive(state: WorkspacesState | null): boolean {
  return state === null || state.workspaces.some((w) => w.id === state.selfId && w.active)
}

/** The N-th tab (1-based, like ⌘1…⌘9). */
export function nthWorkspaceId(list: readonly WorkspaceInfo[], n: number): WorkspaceId | null {
  return list[n - 1]?.id ?? null
}

/** Tab next to the active one, cyclically (`delta` = 1 next, -1 previous). `null` with fewer than two tabs. */
export function stepWorkspaceId(list: readonly WorkspaceInfo[], delta: 1 | -1): WorkspaceId | null {
  if (list.length < 2) return null
  const at = list.findIndex((w) => w.active)
  const from = at >= 0 ? at : 0
  return list[(from + delta + list.length) % list.length]?.id ?? null
}

/**
 * Branch this view reports to main. `undefined` = still unknown (folder open and git without a reply): does not report,
 * so the tab does not flicker without a branch; without a folder, outside a repository or with git failing it is
 * `null`.
 */
export function branchToReport(
  root: string | null,
  git: GitStatus | null,
  gitFailedRoot: string | null = null
): string | null | undefined {
  if (!root) return null
  if (!git) return gitFailedRoot === root ? null : undefined
  return git.isRepo ? git.branch : null
}

/**
 * The notice of a workspace stopped counting: the tab vanished, became the active one or has nothing more to do (read
 * and without a request).
 */
export function isNoticeStale(list: readonly WorkspaceInfo[], workspaceId: WorkspaceId): boolean {
  const ws = list.find((w) => w.id === workspaceId)
  if (!ws || ws.active) return true
  return ws.unread === 0 && ws.status !== 'attention'
}

/** Plain text capped at `max` characters, on a single line (the session title comes from Claude: it is not trusted). */
export function truncateText(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

/** Accessible text of the unread counter ("1 não lida", "3 não lidas"). */
export function unreadAria(n: number): string {
  return t().app.workspaceBar.unread(n)
}

/** Unread counter on the tab. */
export function unreadLabel(n: number): string {
  return capCount(n)
}

/**
 * Name of the folder that contains the workspace (".../Client/repo" → "Client"). `null` at the disk root or without a
 * folder.
 */
export function parentFolderName(root: string | null): string | null {
  if (!root) return null
  const clean = root.length > 1 ? root.replace(/[\\/]+$/, '') : root
  const parent = dirname(clean)
  if (parent === clean || /^([A-Za-z]:)?[\\/]?$/.test(parent)) return null
  return basename(parent)
}
