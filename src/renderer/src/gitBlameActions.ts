// Tab blame: fetches the `git blame` of the visible tab and hands it to the editor (`setDocumentBlame`), which tracks
// edits on its own. Only rereads when HEAD changes, when the tab is saved or the file is reread from disk (text changed
// with the tab clean); hidden tabs are marked and reread when they show up again. With a dirty tab, the buffer is sent
// too (`--contents`).
import { blameGutterOn, bindBlameHost, hasBlame } from './components/editor/gitBlame'
import { setBlameInline, setDocumentBlame, setDocumentBlameGutter } from './components/editor/documentConfig'
import { hasDocument, subscribeDocChanges } from './components/editor/documentState'
import { currentState } from './components/editor/groupViews'
import { createLatestByKey } from './lib/latest'
import { createReactionScope } from './lib/reactions'
import { serializeDoc } from './lib/textFormat'
import { activeLoadedFileTab } from './tabActions'
import { showCommitInHistory } from './gitHistoryActions'
import { findFileTab, get, onTabsClosed, subscribeDiff, type State } from './store'

const api = window.api

const blameSeq = createLatestByKey<string>()
// HEAD each tab's blame was fetched with; a tab missing here (or with a different HEAD) needs a new one.
const applied = new Map<string, string>()
const stale = new Set<string>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const versionListeners = new Set<() => void>()
let version = 0

const REFRESH_DELAY_MS = 400

/** Changes on every delivered blame: the status bar rereads the cursor line. */
export function subscribeBlameVersion(listener: () => void): () => void {
  versionListeners.add(listener)
  return () => void versionListeners.delete(listener)
}

export function blameVersion(): number {
  return version
}

function bump(): void {
  version++
  for (const listener of versionListeners) listener()
}

const headOf = (s: Pick<State, 'lastCommit'>): string => s.lastCommit?.hash ?? ''

function wanted(s: State): boolean {
  return s.settings['git.blame.inline'] || s.settings['git.blame.statusBar']
}

function shownTabIds(s: Pick<State, 'editorGroups'>): Set<string> {
  return new Set(s.editorGroups.flatMap((g) => (g.activeTabId ? [g.activeTabId] : [])))
}

async function fetchBlame(tabId: string): Promise<void> {
  const s = get()
  const tab = findFileTab(tabId)
  const state = currentState(tabId)
  if (!s.root || !s.git?.isRepo || !tab || !state) return
  if (!wanted(s) && !blameGutterOn(state)) return
  stale.delete(tabId)
  const seq = blameSeq.next(tabId)
  const head = headOf(s)
  const base = state.doc.toJSON()
  const contents = tab.dirty ? serializeDoc(state.doc, tab.eol ?? 'LF') : undefined
  const root = s.root
  const data = await api.git.blame(root, tab.path, contents).catch(() => null)
  if (!blameSeq.isCurrent(tabId, seq) || get().root !== root || !hasDocument(tabId)) return
  applied.set(tabId, head)
  setDocumentBlame(tabId, data ? { data, base } : null)
  bump()
}

function schedule(tabId: string, delay = REFRESH_DELAY_MS): void {
  if (!shownTabIds(get()).has(tabId)) {
    stale.add(tabId)
    return
  }
  const pending = timers.get(tabId)
  if (pending) clearTimeout(pending)
  timers.set(
    tabId,
    setTimeout(() => {
      timers.delete(tabId)
      void fetchBlame(tabId)
    }, delay)
  )
}

function scheduleLoaded(): void {
  for (const tab of get().tabs) if (tab.kind === 'file' && hasDocument(tab.id)) schedule(tab.id, 0)
}

/** "Toggle File Blame": gutter with the blame of each line in the active tab. */
export function toggleFileBlame(): void {
  const tab = activeLoadedFileTab()
  const state = tab ? currentState(tab.id) : undefined
  if (!tab || !state) return
  const on = !blameGutterOn(state)
  setDocumentBlameGutter(tab.id, on)
  if (on && (!hasBlame(state) || applied.get(tab.id) !== headOf(get()))) void fetchBlame(tab.id)
}

function forget(tabId: string): void {
  applied.delete(tabId)
  stale.delete(tabId)
  blameSeq.forget(tabId)
  const timer = timers.get(tabId)
  if (timer) clearTimeout(timer)
  timers.delete(tabId)
}

export function startGitBlameReactions(): () => void {
  const scope = createReactionScope()
  bindBlameHost({
    commitMessage: (hash) => {
      const { root } = get()
      return root ? api.git.lastCommitMessage(root, hash).catch(() => null) : Promise.resolve(null)
    },
    showCommit: (hash) => showCommitInHistory(hash)
  })
  setBlameInline(get().settings['git.blame.inline'])
  scope.add(onTabsClosed((ids) => ids.forEach(forget)))
  // Text replaced with the tab clean: just loaded or reread from disk. Typing dirties the tab before the notice.
  scope.add(
    subscribeDocChanges((tabId) => {
      if (findFileTab(tabId)?.dirty === false) schedule(tabId)
    })
  )
  // Tab saved (dirty → clean): the disk blame now applies.
  scope.add(
    subscribeDiff(
      (s) => s.tabs,
      (tabs, prev) => {
        const wasDirty = new Set(prev.flatMap((t) => (t.kind === 'file' && t.dirty ? [t.id] : [])))
        for (const tab of tabs) if (tab.kind === 'file' && !tab.dirty && wasDirty.has(tab.id)) schedule(tab.id)
      }
    )
  )
  scope.add(subscribeDiff((s) => `${headOf(s)}|${s.git?.isRepo ?? false}`, scheduleLoaded))
  scope.add(
    subscribeDiff(
      (s) => s.settings['git.blame.inline'],
      (on) => setBlameInline(on)
    )
  )
  scope.add(
    subscribeDiff(wanted, (on) => {
      if (on) scheduleLoaded()
    })
  )
  scope.add(
    subscribeDiff(
      (s) => s.editorGroups,
      (groups) => {
        for (const id of shownTabIds({ editorGroups: groups })) {
          if (stale.has(id) || (hasDocument(id) && applied.get(id) !== headOf(get()))) schedule(id, 0)
        }
      }
    )
  )
  return scope.stop
}
