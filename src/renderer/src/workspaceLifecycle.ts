import { t } from '@shared/i18n'
import type { WorkspacesState, WorkspaceSession, SidebarView, WorkspaceChange, FileChange } from '@shared/types'
import { isViewActive } from './lib/workspaces'
import { createLatest } from './lib/latest'
import { basename, isInside } from './lib/path'
import {
  planSession,
  mergeRestoredTabs,
  clampSidebarWidth,
  clampClaudeWidth,
  clampPanelHeight,
  parsePanelPosition,
  clampPanelWidth
} from './lib/session'
import { forgetDocument } from './components/editor/documentStore'
import { DORMANT_PREFIX } from './lib/claudeIds'
import { createDormantConversation } from './lib/claudeConversation'
import { saveDraftText } from './claudeDrafts'
import { createStaleWork } from './lib/staleWork'
import { invalidateProjectFiles } from './projectFiles'
import { changesFileList } from './lib/fileListChange'
import { nextFileRevs } from './lib/fileRevs'
import { get, set, enterSeq, onRootChange, workspaceScopedState } from './store'
import type { Tab } from './types/tabs'
import { attempt } from './attempt'
import { confirmAndSave } from './saveActions'
import { flushSession, cancelSessionSave, scheduleSessionSave, setRestoring } from './sessionActions'
import { notify } from './toasts'
import { syncSettings } from './settingsActions'
import { refreshLspStatus } from './lspActions'
import { loadDir } from './explorerActions'
import { refreshGit, scheduleGitRefresh, INACTIVE_GIT_REFRESH_MS } from './gitActions'
import { tabFromSession } from './tabActions'
import { CLOSED_TABS_LIMIT } from './lib/closedTabs'
import { createTerminal } from './terminalActions'
import { syncTabsWithDisk } from './diskSync'
import { breakpointsFromSession } from './lib/debugBreakpoints'

const api = window.api

/** Bar state received from main; equal to the previous one (same content) re-renders nobody. */
export function setWorkspaces(state: WorkspacesState): void {
  const prev = get().workspaces
  if (prev && JSON.stringify(prev) === JSON.stringify(state)) return
  const viewActive = isViewActive(state)
  const wasActive = get().viewActive
  set({ workspaces: state, viewActive })
  // Became the visible view again: applies at once what the watcher brought while it was hidden.
  if (viewActive && !wasActive) flushStaleWork()
}

// Open folder requests in flight (dialogs, IPC): only the last one proceeds.
const openSeq = createLatest()

/**
 * Opens a folder in this window (chosen in the dialog, in the recents list or requested by main): focuses the window
 * that already has it, asks about unsaved files, writes the current folder session and only then switches.
 */
let openChain: Promise<unknown> = Promise.resolve()

export async function openWorkspace(root: string): Promise<void> {
  if (root === get().root) return
  const seq = openSeq.next()
  const switched = await attempt(async () => {
    if (await api.workspace.focusIfOpen(root)) return false
    // A newer request took over: this one must not even ask about unsaved files.
    if (!openSeq.isCurrent(seq)) return false
    // Asks only after the folder is chosen (like VS Code): cancelling the picker is not a bother.
    if (!(await confirmAndSave(get().tabs.map((t) => t.id)))) return false
    if (!openSeq.isCurrent(seq)) return false
    // Before switching: the state is still the current folder's.
    flushSession()
    // Serialized: the order in which main applies `setWindowRoot` must match the order the renderer enters folders.
    const opened = openChain.then(() => api.workspace.open(root))
    openChain = opened.catch(() => {})
    return opened
  })
  if (!switched) return
  // Main already switched this window's folder: always enter (`enterSeq` discards older restores).
  await enterWorkspace(root)
}

export async function pickAndOpenWorkspace(): Promise<void> {
  const root = await attempt(() => api.workspace.openFolder())
  if (root) await openWorkspace(root)
}

/** Resets the previous folder state and loads the new one (main already registered it as this window's). */
async function enterWorkspace(root: string): Promise<void> {
  const seq = enterSeq.next()
  setRestoring(true)
  cancelSessionSave()
  const session = api.session.load(root).catch(() => null)
  set((s) => ({ root, ...workspaceScopedState(root, s) }))
  document.title = `${basename(root)} — Walph`
  void syncSettings(root)
  void refreshLspStatus()
  // Layout on entering: the session only overwrites it if the user did not touch it during the restore.
  const { view, sidebarVisible, claudeVisible } = get()
  const loading = Promise.all([loadDir(root), refreshGit()])
  let openDirs: string[]
  try {
    openDirs = await restoreSession(root, seq, await session, { view, sidebarVisible, claudeVisible })
  } finally {
    if (enterSeq.isCurrent(seq)) {
      setRestoring(false)
      // The restored state is already final: write it (covers sessions without a file and discarded tabs).
      scheduleSessionSave()
    }
  }
  await Promise.all([loading, ...openDirs.map((dir) => loadDir(dir))])
}

export async function restoreWorkspace(): Promise<void> {
  const seq = openSeq.next()
  await attempt(
    async () => {
      // Main decides this window's folder (argv, last session, recent); it needs `open` to watch it.
      const root = await api.workspace.current()
      if (!root || !openSeq.isCurrent(seq)) return
      if (!(await api.workspace.open(root))) return
      await enterWorkspace(root)
    },
    { format: (message) => t().app.errors.restoreFolder(message) }
  )
}

/** Applies the session without trampling what the user did during the read. Returns the folders to load in the tree. */
async function restoreSession(
  root: string,
  seq: number,
  session: WorkspaceSession | null,
  entry: { view: SidebarView; sidebarVisible: boolean; claudeVisible: boolean }
): Promise<string[]> {
  if (!session) return []
  const dirs = session.expanded.filter((dir) => dir !== root && isInside(root, dir))
  const [fileExists, dirExists] = await Promise.all([
    Promise.all(session.tabs.map((t) => api.fs.exists(t.path).catch(() => false))),
    Promise.all(dirs.map((dir) => api.fs.exists(dir).catch(() => false)))
  ])
  if (!enterSeq.isCurrent(seq)) return []

  const plan = planSession(session, fileExists)
  // Tabs opened by the user while the session loaded (they may have unsaved text) stay and win over duplicates.
  const hasPreview = get().tabs.some((t) => t.kind === 'file' && t.preview)
  const restored: Tab[] = plan.tabs.map((t) => tabFromSession(t, t.kind === 'file' && t.preview && !hasPreview))
  const merged = mergeRestoredTabs({ restored, plan, current: get(), newId: () => crypto.randomUUID() })
  // Session groups become the restored ids; a closed tab from a group that did not return falls into the active group.
  const closedTabs = (session.closedTabs ?? []).map((c) => ({
    tab: c.tab,
    groupId: c.group === null ? null : (merged.editorGroups[c.group]?.id ?? null),
    index: c.index
  }))
  for (const t of merged.dropped) forgetDocument(t.id)
  const open = dirs.filter((_, i) => dirExists[i])
  const claudeDefaults = {
    permissionMode: get().settings['claude.initialPermissionMode'],
    model: get().settings['claude.model']
  }
  // Only when the tabs really come in (no chat opened in the meantime) are the drafts stored.
  const dormantClaude = (get().claude.conversations.length === 0 ? (session.claudeTabs ?? []) : []).map((tab) => {
    const conv = createDormantConversation(tab, `${DORMANT_PREFIX}${crypto.randomUUID()}`, claudeDefaults)
    if (tab.draft) saveDraftText(conv.id, tab.draft)
    return conv
  })
  const dormantActive = Math.min(Math.max(session.claudeActive ?? 0, 0), Math.max(dormantClaude.length - 1, 0))
  set((s) => ({
    tabs: merged.tabs,
    editorGroups: merged.editorGroups,
    activeGroupId: merged.activeGroupId,
    editorLayout: merged.editorLayout,
    // Whoever picked a tab in the meantime keeps it.
    activeTabId: merged.activeTabId,
    // Tabs closed while the session was read are more recent than the stored stack's.
    closedTabs: [...closedTabs, ...s.closedTabs].slice(-CLOSED_TABS_LIMIT),
    expanded: { ...s.expanded, ...Object.fromEntries(open.map((dir) => [dir, true])) },
    view: s.view === entry.view ? session.view : s.view,
    sidebarVisible: s.sidebarVisible === entry.sidebarVisible ? session.sidebarVisible : s.sidebarVisible,
    sidebarWidth: clampSidebarWidth(session.sidebarWidth),
    // Session Claude tabs come in dormant (no process) if the user has not opened any yet.
    ...(s.claude.conversations.length === 0 && dormantClaude.length > 0
      ? { claude: { ...s.claude, conversations: dormantClaude, activeId: dormantClaude[dormantActive]?.id ?? null } }
      : {}),
    claudeVisible: s.claudeVisible === entry.claudeVisible ? session.claudeVisible === true : s.claudeVisible,
    claudeWidth: clampClaudeWidth(session.claudeWidth, window.innerWidth),
    panelHeight: clampPanelHeight(session.panelHeight, window.innerHeight),
    // Old sessions lack these fields: main normalizes them, but the renderer does not trust it.
    panelPosition: parsePanelPosition(session.panelPosition),
    panelWidth: clampPanelWidth(session.panelWidth, window.innerWidth),
    // Breakpoints and expressions added during the read stay alongside the session ones.
    breakpoints: { ...breakpointsFromSession(session.breakpoints), ...s.breakpoints },
    debugWatches: [...new Set([...(session.watches ?? []), ...s.debugWatches])]
  }))
  if (session.terminalVisible) {
    if (get().terminals.length === 0) void createTerminal()
    else set({ terminalVisible: true })
  } else if (get().terminalVisible) set({ terminalVisible: false, panelMaximized: false })
  return open
}

// When hidden, the view only accumulates what changed (git, folders, files); `flushStaleWork` applies it all on return.
const staleWork = createStaleWork()
// Main reports each folder failure only once: when hidden, the view keeps the notice to show it on return.
let pendingWatchError: string | null = null

export function handleWorkspaceChange(change: WorkspaceChange): void {
  if (change.watchError) {
    if (get().viewActive) notify(change.watchError)
    else pendingWatchError = change.watchError
    return
  }
  if (change.full || change.files.some(changesFileList)) invalidateProjectFiles()
  if (!get().viewActive) {
    // Folders and git wait for the view to return; git, however, gets a widely spaced refresh (the WorkspaceBar branch
    // comes from here). Open tabs react right away: a conflict with an external change cannot wait (auto save/the close
    // dialog would overwrite the disk).
    staleWork.add({ dirs: change.dirs, files: [], ...(change.full ? { full: true } : {}) })
    syncTabsWithDisk(change.full ? allFileTabChanges() : change.files)
    scheduleGitRefresh(INACTIVE_GIT_REFRESH_MS)
    return
  }
  if (change.full) applyWorkspaceChange(null, null)
  else applyWorkspaceChange(change.dirs, change.files)
}

/** Synthetic change on every open file tab (the read compares with the saved content). */
function allFileTabChanges(): FileChange[] {
  return get().tabs.flatMap((t) => (t.kind === 'file' ? [{ path: t.path, type: 'change' as const }] : []))
}

function applyWorkspaceChange(dirs: string[] | null, files: FileChange[] | null): void {
  const loaded = get().dirs
  for (const dir of dirs ?? Object.keys(loaded)) if (loaded[dir]) void loadDir(dir)
  scheduleGitRefresh()
  // Many files at once: reevaluates every open tab (the read compares with the saved content).
  bumpFileRevs(files)
  syncTabsWithDisk(files ?? allFileTabChanges())
}

/** Diff, image and Markdown preview tabs depend on the file content: the watcher reevaluates them by path. */
function bumpFileRevs(files: FileChange[] | null): void {
  const next = nextFileRevs(get().tabs, get().fileRevs, files)
  if (next) set({ fileRevs: next })
}

function flushStaleWork(): void {
  if (pendingWatchError) {
    notify(pendingWatchError)
    pendingWatchError = null
  }
  const batch = staleWork.take()
  if (!batch) return
  applyWorkspaceChange(batch.dirs, batch.files)
  // The open diffs did not see the files touched while hidden: reread all of them.
  bumpFileRevs(null)
}

export function startWorkspaceReactions(): () => void {
  // Folder changed: what was accumulated belongs to the previous one.
  return onRootChange(() => {
    staleWork.clear()
    pendingWatchError = null
  })
}
