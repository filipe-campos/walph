import { setDocumentBaseline } from './components/editor/documentConfig'
import { hasDocument } from './components/editor/documentState'
import { createLatestByKey } from './lib/latest'
import { createReactionScope } from './lib/reactions'
import { splitLines } from './lib/textFormat'
import { trackPending } from './lib/pendingWork'
import { get, findFileTab, forcedEncodingFor, subscribeDiff, onTabsClosed, type State } from './store'

const api = window.api

// Last baseline applied to each tab (so the editor is not retriggered when nothing changed) and the sequence that
// discards stale answers.
const baselineApplied = new Map<string, string | null>()
const baselineSeq = createLatestByKey<string>()
// Hidden tabs with a possibly outdated baseline: reread when they become active again.
const staleBaselines = new Set<string>()

/** Fetches the tab's index content and hands it to the gutter. Only for tabs already loaded in the editor. */
export function refreshBaseline(tabId: string): Promise<void> {
  return trackPending('baseline', refreshBaselineNow(tabId))
}

async function refreshBaselineNow(tabId: string): Promise<void> {
  const { root, git } = get()
  const tab = findFileTab(tabId)
  if (!root || !git || !tab || !hasDocument(tabId)) return
  staleBaselines.delete(tabId)
  const seq = baselineSeq.next(tabId)
  let text: string | null = null
  if (git.isRepo) {
    try {
      // Same decoding as the tab: with Windows-1252 chosen, an index read as UTF-8 would mark every accented line.
      text = await api.git.baseline(root, tab.path, forcedEncodingFor(tab.path))
    } catch {
      text = null
    }
  }
  if (!baselineSeq.isCurrent(tabId, seq) || get().root !== root || findFileTab(tabId)?.path !== tab.path) return
  if (!hasDocument(tabId) || (baselineApplied.has(tabId) && baselineApplied.get(tabId) === text)) return
  baselineApplied.set(tabId, text)
  setDocumentBaseline(tabId, text === null ? null : splitLines(text))
}

/** Tabs visible now: the active one of each group. */
function shownTabIds(s: Pick<State, 'editorGroups'>): Set<string> {
  return new Set(s.editorGroups.flatMap((g) => (g.activeTabId ? [g.activeTabId] : [])))
}

/** On each new status (stage, commit, checkout…) the baselines of already loaded tabs may have changed. */
export function refreshBaselines(): void {
  const { tabs } = get()
  const shown = shownTabIds(get())
  for (const tab of tabs) {
    if (tab.kind !== 'file' || !hasDocument(tab.id)) continue
    // Only visible tabs (the active one of each group) pay for `git show`; hidden ones are marked, reread on activation.
    if (shown.has(tab.id)) void refreshBaseline(tab.id)
    else staleBaselines.add(tab.id)
  }
}

/** Gutter reactions: prunes closed tabs' state and rereads the baseline of hidden tabs that become visible again. */
export function startGitBaselineReactions(): () => void {
  const scope = createReactionScope()
  scope.add(
    onTabsClosed((ids) => {
      for (const id of ids) {
        baselineApplied.delete(id)
        baselineSeq.forget(id)
        staleBaselines.delete(id)
      }
    })
  )
  // A hidden tab with an outdated baseline becomes visible again: refresh the gutter.
  scope.add(
    subscribeDiff(
      (s) => s.editorGroups,
      (editorGroups, prev) => {
        const before = shownTabIds({ editorGroups: prev })
        for (const id of shownTabIds({ editorGroups })) {
          if (!before.has(id) && staleBaselines.has(id)) void refreshBaseline(id)
        }
      }
    )
  )
  return scope.stop
}
