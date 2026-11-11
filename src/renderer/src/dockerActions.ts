// Actions of the Containers screen (state in `store.docker`/`store.screen`). They live outside `store.ts` because
// of size; the store does not import this module.
import type {
  DockerComposeAction,
  DockerContainer,
  DockerContainerAction,
  DockerLogsBatch,
  DockerLogsEnd,
  DockerStatsSample
} from '@shared/types'
import { t } from '@shared/i18n'
import { focusEditor } from './components/editor/editorFocus'
import { captureFocus, focusRegion, hasFocus, restoreFocus, type FocusSnapshot } from './focusBridge'
import { askClaude } from './claudePromptActions'
import { get, onRootChange, set, useStore } from './store'
import { attempt } from './attempt'
import { errorMessage } from './lib/errors'
import { createLatest } from './lib/latest'
import { createReactionScope } from './lib/reactions'
import { appendLogLines, type DockerDetailTab, type DockerState } from './lib/dockerContainers'
import { notify } from './toasts'
import { createTerminal } from './terminalActions'
import { keepsWorkbenchHidden, registerOverlayPolicy, type OverlayPolicy } from './commands/registry'

const api = window.api

/** Refreshes the list periodically while the screen is open; the ActivityBar badge much slower, only when visible. */
const OPEN_REFRESH_MS = 5_000
const BADGE_REFRESH_MS = 30_000
/** First badge check, shortly after opening (without competing with the session restore). */
const BADGE_FIRST_MS = 4_000

function patch(changes: Partial<DockerState>): void {
  set((s) => ({ docker: { ...s.docker, ...changes } }))
}

function setBusy(key: string, on: boolean): void {
  set((s) => {
    const busy = { ...s.docker.busy }
    if (on) busy[key] = true
    else delete busy[key]
    return { docker: { ...s.docker, busy } }
  })
}

// ---------- Screen ----------

function showContainers(): void {
  set({ screen: 'containers' })
}

/** Back to the normal layout; `focus` refocuses the editor (the shortcut toggles, other commands pick the focus). */
function leaveContainers(options: { focus?: boolean } = {}): void {
  if (get().screen === 'workbench') return
  set({ screen: 'workbench' })
  if (options.focus) setTimeout(focusEditor, 0)
}

/**
 * Containers screen: the editor, the terminal and Claude are hidden. ⌘W only leaves the screen (does not close the
 * invisible tab); editor/tab commands go back to the layout before running; globals, palettes and workspaces keep it.
 */
const containersPolicy: OverlayPolicy = {
  priority: 40,
  active: (s) => s.screen === 'containers',
  keeps: (id) => id === 'view.containers' || keepsWorkbenchHidden(id),
  close: (id) => leaveContainers({ focus: id === 'workbench.closeTab' }),
  consumes: (id) => id === 'workbench.closeTab'
}

/** ⇧⌘D. */
export function toggleContainers(): void {
  if (get().screen === 'containers') leaveContainers({ focus: true })
  else showContainers()
}

// ---------- List ----------

const refreshSeq = createLatest()

/**
 * Reads `info()` (whenever `full` or Docker was unavailable) and `list()`. Only the latest call counts; if `list`
 * fails while Docker still responds, the screen shows the error without losing the previous list.
 */
export async function refreshDocker(full = false, background = false): Promise<void> {
  const seq = refreshSeq.next()
  patch({ loading: true })
  try {
    const known = get().docker.info
    let info = full || !known || !known.ok ? await api.docker.info() : known
    if (!refreshSeq.isCurrent(seq)) return
    if (!info.ok) {
      patch({ info, list: null, stats: {}, listError: null, loading: false })
      dropSelectionIfGone()
      return
    }
    try {
      const list = await api.docker.list(background ? { background: true } : undefined)
      if (!refreshSeq.isCurrent(seq)) return
      // Without Docker main drops the stats subscription: restart it when Docker responds again (idempotent in main).
      if (known?.ok !== true && get().screen === 'containers') api.docker.startStats()
      patch({ info, list, listError: null, loading: false })
    } catch (err) {
      if (!refreshSeq.isCurrent(seq)) return
      // The daemon may have stopped between the two calls: `info` says what to show.
      info = await api.docker.info()
      if (!refreshSeq.isCurrent(seq)) return
      if (info.ok) patch({ info, listError: errorMessage(err), loading: false })
      else patch({ info, list: null, stats: {}, listError: null, loading: false })
    }
    dropSelectionIfGone()
  } catch (err) {
    if (!refreshSeq.isCurrent(seq)) return
    patch({ loading: false, listError: errorMessage(err) })
  }
}

/** The container open in the detail vanished from the list (removed externally). */
function dropSelectionIfGone(): void {
  const { selectedId, list, info } = get().docker
  if (!selectedId) return
  if (info?.ok === false || (list && !list.containers.some((c) => c.id === selectedId))) closeContainerDetail()
}

// ---------- Actions ----------

async function runBusy(key: string, run: () => Promise<void>, options: { rootScoped?: boolean } = {}): Promise<void> {
  if (get().docker.busy[key]) return
  const root = get().root
  // Folder-bound action (header Compose up): if the folder changed meanwhile, the result no longer belongs to it.
  const stale = (): boolean => !!options.rootScoped && get().root !== root
  setBusy(key, true)
  try {
    await attempt(run, { quiet: stale })
  } finally {
    // The list reflects the action before the button is enabled again (otherwise a second click acts on stale state).
    if (!stale()) await refreshDocker()
    setBusy(key, false)
  }
}

export function runContainerAction(id: string, action: DockerContainerAction): Promise<void> {
  return runBusy(id, () => api.docker.action(id, action))
}

export function runComposeAction(project: string, action: DockerComposeAction): Promise<void> {
  return runBusy(`project:${project}`, () => api.docker.composeAction(project, action))
}

/** Header "Compose up": the compose file of this workspace's folder. */
export function composeUpWorkspace(): Promise<void> {
  return runBusy('workspace', () => api.docker.composeUpWorkspace(), { rootScoped: true })
}

/** Panel terminal with `docker exec -it <id> sh`. */
export async function openContainerTerminal(container: DockerContainer): Promise<void> {
  await createTerminal({ dockerExec: container.id, title: `docker exec ${container.name}` })
}

/** "Investigate with Claude": ready-made prompt from main (logs + inspect) in a new session. */
export async function investigateContainer(container: DockerContainer): Promise<void> {
  if (!get().root) {
    notify(t().containers.problem.needsFolder, 'info')
    return
  }
  const key = `investigate:${container.id}`
  if (get().docker.busy[key]) return
  setBusy(key, true)
  try {
    await attempt(async () => {
      const prompt = await api.docker.investigationPrompt(container.id)
      leaveContainers()
      await askClaude(prompt)
    })
  } finally {
    setBusy(key, false)
  }
}

// ---------- Detail: logs and inspect ----------

const followToken = createLatest()
let queuedBatches: DockerLogsBatch[] = []
let queuedEnds: DockerLogsEnd[] = []
let flushFrame = 0

function flushLogs(): void {
  flushFrame = 0
  const logs = get().docker.logs
  // Without `seq` the follow has not answered yet: `startFollow` calls again when it does.
  if (!logs || logs.seq === null) return
  const batches = queuedBatches.filter((b) => b.seq === logs.seq)
  const ends = queuedEnds.filter((e) => e.seq === logs.seq)
  queuedBatches = []
  queuedEnds = []
  if (batches.length === 0 && ends.length === 0) return
  let next = logs
  for (const batch of batches) next = appendLogLines(next, batch.lines)
  const end = ends[ends.length - 1]
  if (end) next = { ...next, ended: true, error: end.error }
  patch({ logs: next })
}

function scheduleFlush(): void {
  if (!flushFrame) flushFrame = requestAnimationFrame(flushLogs)
}

async function startFollow(id: string): Promise<void> {
  const token = followToken.next()
  queuedBatches = []
  queuedEnds = []
  patch({ logs: { id, seq: null, lines: [], offset: 0, ended: false, error: null } })
  try {
    const seq = await api.docker.followLogs(id)
    if (!followToken.isCurrent(token)) return
    const logs = get().docker.logs
    if (!logs || logs.id !== id) return
    patch({ logs: { ...logs, seq } })
    flushLogs()
  } catch (err) {
    if (!followToken.isCurrent(token)) return
    const logs = get().docker.logs
    if (logs?.id === id) patch({ logs: { ...logs, ended: true, error: errorMessage(err) } })
  }
}

const inspectToken = createLatest()

async function loadInspect(id: string): Promise<void> {
  const token = inspectToken.next()
  patch({ inspect: { id, data: null, error: null } })
  try {
    const data = await api.docker.inspect(id)
    if (inspectToken.isCurrent(token) && get().docker.selectedId === id) patch({ inspect: { id, data, error: null } })
  } catch (err) {
    if (inspectToken.isCurrent(token) && get().docker.selectedId === id)
      patch({ inspect: { id, data: null, error: errorMessage(err) } })
  }
}

// Detail focus: who opened it (to return focus on close) and whether via keyboard (the detail focuses the active tab).
let detailOpener: FocusSnapshot | null = null
let focusDetailPending = false

/** `ContainerDetail` consumes the request on mount: opening via keyboard moves focus to the active tab. */
export function takeDetailFocusRequest(): boolean {
  const pending = focusDetailPending
  focusDetailPending = false
  return pending
}

/** Opens a container's detail (follows the logs). Same container: only switches the tab. */
export function openContainerDetail(id: string, tab: DockerDetailTab = 'logs'): void {
  const opener = captureFocus('containersView')
  if (opener) {
    detailOpener = opener
    focusDetailPending = opener.viaKeyboard
  }
  if (get().docker.selectedId === id) {
    focusDetailPending = false
    setDetailTab(tab)
    return
  }
  patch({ selectedId: id, detailTab: tab, inspect: null })
  void startFollow(id)
  if (tab === 'details') void loadInspect(id)
}

export function setDetailTab(tab: DockerDetailTab): void {
  const { selectedId, detailTab, inspect } = get().docker
  if (!selectedId) return
  if (tab !== detailTab) patch({ detailTab: tab })
  // The details are reread every time the tab opens (state, health and restarts change).
  if (tab === 'details' && (tab !== detailTab || inspect?.id !== selectedId)) void loadInspect(selectedId)
}

/** Closes the detail and stops `docker logs -f`. */
function closeContainerDetail(): void {
  followToken.invalidate()
  inspectToken.invalidate()
  queuedBatches = []
  queuedEnds = []
  api.docker.stopLogs()
  if (get().docker.selectedId !== null || get().docker.logs) patch({ selectedId: null, logs: null, inspect: null })
}

// ---------- Wiring with main ----------

function onStats(samples: DockerStatsSample[]): void {
  if (get().screen !== 'containers') return
  patch({ stats: Object.fromEntries(samples.map((s) => [s.id, s])) })
}

/**
 * Starts the Docker wiring (call once in `App`): main events, `docker stats` and the periodic refresh only while the
 * screen is open, and the problems badge on the activity bar. Returns the unsubscribe.
 */
export function startDockerReactions(): () => void {
  const scope = createReactionScope()
  scope.add(registerOverlayPolicy(containersPolicy))
  scope.add(api.docker.onStats(onStats))
  scope.add(
    api.docker.onLogs((batch) => {
      queuedBatches.push(batch)
      scheduleFlush()
    })
  )
  scope.add(
    api.docker.onLogsEnd((end) => {
      queuedEnds.push(end)
      scheduleFlush()
    })
  )

  let openTimer: ReturnType<typeof setInterval> | undefined
  const visible = (): boolean => document.visibilityState === 'visible'
  // Without Docker installed there is nothing to retry automatically (each attempt is a process): only "Try again".
  const canPoll = (): boolean => {
    const info = get().docker.info
    return !(info && !info.ok && info.reason === 'notInstalled')
  }

  const enter = (): void => {
    api.docker.startStats()
    void refreshDocker(true)
    openTimer = setInterval(() => {
      if (visible() && get().viewActive && canPoll() && !get().docker.loading) void refreshDocker()
    }, OPEN_REFRESH_MS)
  }
  const leave = (): void => {
    clearInterval(openTimer)
    openTimer = undefined
    api.docker.stopStats()
    closeContainerDetail()
    patch({ stats: {} })
  }

  scope.add(
    useStore.subscribe(
      (s) => s.screen === 'containers',
      (open) => (open ? enter() : leave())
    )
  )
  // The header compose file depends on the folder.
  scope.add(
    onRootChange((s) => {
      if (s.screen !== 'containers') return
      closeContainerDetail()
      void refreshDocker()
    })
  )

  // Activity bar badge: only outside the screen (inside it the list already refreshes) and without wasting processes.
  const badgeTick = (): void => {
    if (get().screen === 'containers' || !visible() || !get().viewActive || !canPoll() || get().docker.loading) return
    // `background`: main answers from the cache shared across views (25 s) instead of running docker per view.
    void refreshDocker(false, true)
  }
  const first = setTimeout(badgeTick, BADGE_FIRST_MS)
  const badgeTimer = setInterval(badgeTick, BADGE_REFRESH_MS)

  scope.add(() => {
    clearTimeout(first)
    clearInterval(badgeTimer)
    clearInterval(openTimer)
    cancelAnimationFrame(flushFrame)
    flushFrame = 0
    if (get().screen === 'containers') {
      api.docker.stopStats()
      api.docker.stopLogs()
    }
  })
  return scope.stop
}

/** Closes the detail from the UI (Esc, ×, back) and returns focus to its opener (otherwise, to the search). */
export function dismissContainerDetail(): void {
  const hadFocus = hasFocus('containerDetail')
  closeContainerDetail()
  if (!hadFocus) return
  const opener = detailOpener
  setTimeout(() => {
    if (!restoreFocus(opener)) focusRegion('containersSearch')
  }, 0)
}
