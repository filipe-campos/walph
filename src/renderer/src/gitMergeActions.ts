// Merge conflicts: editor commands (next/previous, accept all), "Compare Changes" and Source Control's "Mark as
// Resolved" (stages the file, confirming if markers remain).
import type { GitFileStatus } from '@shared/types'
import { t } from '@shared/i18n'
import { hasDocument } from './components/editor/documentState'
import { currentState, getView, shownTabId } from './components/editor/groupViews'
import { acceptAllConflicts, bindMergeHost, conflictsOf, stepConflict } from './components/editor/mergeConflicts'
import { stageFiles } from './gitActions'
import { basename } from './lib/path'
import { hasConflictMarkers, type ConflictChoice } from './lib/mergeConflicts'
import { confirmDialog } from './saveActions'
import { activeLoadedFileTab, openConflictDiff } from './tabActions'
import { notify } from './toasts'
import { get } from './store'

/** Editor view showing the active file tab, or `null`. */
function activeEditorView(): ReturnType<typeof getView> {
  const tab = activeLoadedFileTab()
  return tab && shownTabId() === tab.id ? getView() : null
}

const noConflicts = (): void => notify(t().git.merge.noConflicts, 'info')

export function hasActiveConflicts(): boolean {
  const view = activeEditorView()
  return !!view && conflictsOf(view.state).length > 0
}

export function stepActiveConflict(direction: 1 | -1): void {
  const view = activeEditorView()
  if (!view || !stepConflict(view, direction)) noConflicts()
}

export function acceptAllActiveConflicts(choice: ConflictChoice): void {
  const view = activeEditorView()
  if (!view || !acceptAllConflicts(view, choice)) noConflicts()
}

/** Current file text: the buffer, if the tab is loaded; otherwise the disk. */
async function fileText(path: string): Promise<string | null> {
  const tab = get().tabs.find((x) => x.kind === 'file' && x.path === path)
  if (tab && hasDocument(tab.id)) return currentState(tab.id)?.doc.toString() ?? null
  return window.api.fs.readText(path).then(
    (f) => f.text,
    () => null
  )
}

/** "Mark as Resolved": stages the conflicted file; with markers still in the text, asks first. */
export async function markConflictResolved(file: GitFileStatus): Promise<boolean> {
  const text = await fileText(file.path)
  if (text !== null && hasConflictMarkers(text)) {
    const m = t().git.merge
    const confirmed = await confirmDialog({
      message: m.markResolvedConfirm(basename(file.path)),
      confirmLabel: m.markResolvedButton
    })
    if (!confirmed) return false
  }
  return stageFiles([file.path])
}

export function startGitMergeReactions(): () => void {
  bindMergeHost({
    compare: (tabId) => {
      const tab = get().tabs.find((x) => x.id === tabId)
      if (tab?.kind === 'file') openConflictDiff(tab.path)
    }
  })
  return () => bindMergeHost({ compare: () => {} })
}
