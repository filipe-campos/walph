// Stage / unstage / revert by hunk and by selected lines, from the editor (baseline = index, in the gutter) or from
// the git diff. Stage and unstage go to main (patch applied to the index); revert is a text edit: in a loaded tab it
// goes through the buffer (undoable) and, without a tab, reads and writes the file through the editor's channels.
import type { EditorState } from '@codemirror/state'
import { diffLines } from '@shared/lineDiff'
import {
  hunkAtLine,
  hunkRange,
  hunksInRanges,
  mapRangesToOld,
  selectLines,
  type LineRange
} from '@shared/hunkSelection'
import { t } from '@shared/i18n'
import { attempt } from './attempt'
import { applyTabEdits } from './components/editor/documentStore'
import { hasDocument } from './components/editor/documentState'
import { baselineOf, bindHunkHost } from './components/editor/gitGutter'
import { currentState } from './components/editor/groupViews'
import { diffViewsOf, type DiffHunkAction } from './components/editor/diffHunks'
import { stageFileRanges, unstageFileRanges } from './gitActions'
import { basename } from './lib/path'
import { changedRange } from './lib/textDiff'
import { detectEol, splitLines } from './lib/textFormat'
import { confirmDialog, saveTab } from './saveActions'
import { activeTab } from './tabActions'
import { notify } from './toasts'
import { get } from './store'
import type { DiffTab, FileTab } from './types/tabs'

export type RangeAction = DiffHunkAction

/** Lines touched by each selection; a selection ending at the start of a line does not include it. */
function selectionRanges(state: EditorState): LineRange[] {
  return state.selection.ranges.map((r) => {
    const from = state.doc.lineAt(r.from)
    const end = state.doc.lineAt(r.to)
    const to = r.to > r.from && r.to === end.from && end.number > from.number ? end.number - 1 : end.number
    return { from: from.number, to }
  })
}

const nothingSelected = (): false => {
  notify(t().git.hunks.nothingSelected, 'info')
  return false
}

/** Action on the lines of a file tab (diff of the index against the buffer, the same as the gutter's). */
async function runOnFile(tab: FileTab, ranges: LineRange[], action: RangeAction): Promise<boolean> {
  const state = currentState(tab.id)
  const baseline = state ? baselineOf(state) : null
  if (!state || !baseline) return nothingSelected()
  const doc = state.doc.toJSON()
  const hunks = diffLines(baseline, doc)
  if (action === 'unstage') {
    // Buffer lines become index lines; main decides what was staged in them.
    const mapped = mapRangesToOld(hunks, ranges)
    return mapped.length ? unstageFileRanges(tab.path, mapped) : nothingSelected()
  }
  if (hunksInRanges(hunks, ranges, doc.length).length === 0) return nothingSelected()
  if (action === 'stage') {
    // Main reads the file from disk: the lines only match a saved buffer.
    if (tab.dirty && !(await saveTab(tab.id))) return false
    return stageFileRanges(tab.path, ranges)
  }
  const reverted = selectLines(baseline, doc, hunks, ranges, 'revert').join('\n')
  const change = changedRange(state.doc.toString(), reverted)
  return change ? applyTabEdits(tab.id, [change]) : false
}

/** Reverts on disk (index against working tree diff): via the tab if loaded and clean; otherwise writes the file. */
async function revertFromDiff(
  path: string,
  original: string[],
  modified: string[],
  ranges: LineRange[]
): Promise<boolean> {
  const hunks = diffLines(original, modified)
  if (hunksInRanges(hunks, ranges, modified.length).length === 0) return nothingSelected()
  const reverted = selectLines(original, modified, hunks, ranges, 'revert')
  const fileTab = get().tabs.find((x): x is FileTab => x.kind === 'file' && x.path === path)
  if (fileTab && hasDocument(fileTab.id)) {
    const state = currentState(fileTab.id)
    if (!state || fileTab.dirty) {
      notify(t().git.hunks.saveFirst)
      return false
    }
    const change = changedRange(state.doc.toString(), reverted.join('\n'))
    if (change && !applyTabEdits(fileTab.id, [change])) return false
    return saveTab(fileTab.id)
  }
  const m = t().git.hunks
  const confirmed = await confirmDialog({
    message: m.revertConfirm(basename(path)),
    detail: t().git.actions.cannotBeUndone,
    confirmLabel: m.revertButton,
    destructive: true
  })
  if (!confirmed) return false
  return attempt(
    async () => {
      const { text, encoding } = await window.api.fs.readText(path)
      // The file changed since the diff was built: the lines no longer apply.
      if (splitLines(text).join('\n') !== modified.join('\n')) return nothingSelected()
      await window.api.fs.writeFile(path, reverted.join(detectEol(text) === 'CRLF' ? '\r\n' : '\n'), encoding)
      return true
    },
    { fallback: false }
  )
}

/** Action on the (right side) lines of a git diff. */
function runOnDiff(tab: DiffTab, ranges: LineRange[], action: RangeAction): Promise<boolean> | false {
  if (!diffActions(tab).includes(action)) return false
  if (action === 'stage') return stageFileRanges(tab.path, ranges)
  if (action === 'unstage') return unstageFileRanges(tab.path, ranges)
  const views = diffViewsOf(tab.id)
  if (!views) return false
  return revertFromDiff(tab.path, views.original.state.doc.toJSON(), views.modified.state.doc.toJSON(), ranges)
}

/** Hunk actions a diff accepts: index → working tree, stage/revert; HEAD → index, unstage. */
export function diffActions(tab: DiffTab): readonly RangeAction[] {
  if (tab.commit ?? tab.proposal ?? tab.mergeCompare) return []
  return tab.staged ? ['unstage'] : ['stage', 'revert']
}

/** Action on a diff hunk (gutter buttons), with the right side lines. */
export function runDiffHunk(tabId: string, action: RangeAction, range: LineRange): void {
  const tab = get().tabs.find((x): x is DiffTab => x.id === tabId && x.kind === 'diff')
  if (tab) void runOnDiff(tab, [range], action)
}

/** The action makes sense in the active tab (palette commands). */
export function canRunOnActive(action: RangeAction): boolean {
  const tab = activeTab()
  if (tab?.kind === 'diff') return diffActions(tab).includes(action) && !!diffViewsOf(tab.id)
  if (tab?.kind !== 'file') return false
  const state = currentState(tab.id)
  return !!state && !!baselineOf(state)
}

/** "Stage/Unstage/Revert Selected Lines" in the active tab (file or git diff). */
export async function runOnSelection(action: RangeAction): Promise<boolean> {
  const tab = activeTab()
  if (tab?.kind === 'diff') {
    const views = diffViewsOf(tab.id)
    return views ? runOnDiff(tab, selectionRanges(views.modified.state), action) : false
  }
  if (tab?.kind !== 'file') return false
  const state = currentState(tab.id)
  return state ? runOnFile(tab, selectionRanges(state), action) : false
}

/** The whole hunk containing the line (editor gutter). */
function runOnHunkAt(tabId: string, line: number, action: RangeAction): void {
  const tab = get().tabs.find((x): x is FileTab => x.id === tabId && x.kind === 'file')
  const state = currentState(tabId)
  const baseline = state ? baselineOf(state) : null
  if (!tab || !state || !baseline) return
  const doc = state.doc.toJSON()
  const hunk = hunkAtLine(diffLines(baseline, doc), line, doc.length)
  if (hunk) void runOnFile(tab, [hunkRange(hunk, doc.length)], action)
}

export function startGitHunkReactions(): () => void {
  bindHunkHost({
    stage: (tabId, line) => runOnHunkAt(tabId, line, 'stage'),
    revert: (tabId, line) => runOnHunkAt(tabId, line, 'revert')
  })
  return () => bindHunkHost({ stage: () => {}, revert: () => {} })
}
