import { t } from '@shared/i18n'
import { insertAfter, normalizeCustomTitle, removeTerminalFrom } from './lib/terminalGroups'
import { forgetTerminal } from './lib/terminalBus'
import { get, set } from './store'
import { requestFocus } from './focusBridge'
import { attempt } from './attempt'
import type { TerminalInfo, PanelView } from './types/panel'
import { errorMessage } from './lib/errors'
import { notify } from './toasts'
import { togglePicker } from './quickInputActions'

const api = window.api

// The automatic title may arrive before `create` resolves: keep it until the terminal enters the list.
const pendingTitles = new Map<string, string>()
// The shell may exit before `create` resolves: the exit arrives without the terminal in the list and must not be lost.
const exitedEarly = new Set<string>()
// "Early" title/exit are only kept while a `create` is in flight; otherwise they would be ids of dead terminals.
let pendingCreates = 0

export interface CreateTerminalOptions {
  /** Name of a `terminal.profiles` profile; `null`/missing = the default. */
  profile?: string | null
  /** Opens beside this terminal, in the same group (split); otherwise, in a new tab. */
  splitFrom?: string
  /** Opens `docker exec -it <container> sh` instead of a shell (container id). */
  dockerExec?: string
  /** Runs `claude auth login` with the Claude Code CLI instead of a shell. */
  claudeLogin?: boolean
  /** Runs the program requested by the debug adapter (`runInTerminal`), by the event ticket. */
  debugRun?: string
  /** Fixed tab name (e.g. `docker exec web-1`), as if the user had renamed it. */
  title?: string
}

// The panel may have been maximized waiting for this terminal: without it, it does not stay maximized and closed.
function createFailed(): null {
  if (!get().terminalVisible && get().panelMaximized) set({ panelMaximized: false })
  return null
}

export async function createTerminal(options: CreateTerminalOptions = {}): Promise<string | null> {
  const profile = options.profile ?? null
  pendingCreates++
  try {
    const { id, title } = await api.terminal.create({
      cwd: get().root,
      profile,
      ...(options.dockerExec ? { dockerExec: options.dockerExec } : {}),
      ...(options.claudeLogin ? { claudeLogin: true } : {}),
      ...(options.debugRun ? { debugRun: options.debugRun } : {})
    })
    if (exitedEarly.delete(id)) return createFailed()
    set((s) => {
      const source = options.splitFrom ? s.terminals.find((t) => t.id === options.splitFrom) : undefined
      const terminal: TerminalInfo = {
        id,
        groupId: source?.groupId ?? id,
        title: pendingTitles.get(id) ?? title,
        ...(options.title ? { customTitle: options.title } : {}),
        profile
      }
      pendingTitles.delete(id)
      return {
        terminalVisible: true,
        panelView: 'terminal',
        screen: 'workbench' as const,
        terminals: source ? insertAfter(s.terminals, source.id, terminal) : [...s.terminals, terminal],
        activeTerminalId: id
      }
    })
    return id
  } catch (err) {
    notify(t().terminal.createFailed(errorMessage(err)))
    return createFailed()
  } finally {
    if (--pendingCreates === 0) {
      exitedEarly.clear()
      pendingTitles.clear()
    }
  }
}

/** Splits the active terminal: a new shell (same profile) beside it, in the same tab. With none, creates the first. */
export function splitTerminal(): void {
  const active = get().terminals.find((t) => t.id === get().activeTerminalId)
  if (!active) {
    void createTerminal()
    return
  }
  void createTerminal({ profile: active.profile, splitFrom: active.id })
}

/** Shell profile picker (QuickInput); the choice creates the terminal in a new tab. */
export function openTerminalProfilePicker(): void {
  togglePicker('terminalProfile')
}

/** New automatic title (foreground process name). */
export function setTerminalTitle(id: string, title: string): void {
  if (!get().terminals.some((t) => t.id === id)) {
    if (pendingCreates > 0) pendingTitles.set(id, title)
    return
  }
  const current = get().terminals.find((t) => t.id === id)
  if (!current || current.title === title) return
  set((s) => ({ terminals: s.terminals.map((t) => (t.id === id ? { ...t, title } : t)) }))
}

/** Starts editing the terminal name (the active one, if no id is given) in the panel tab. */
export function startRenameTerminal(id?: string): void {
  const target = id ?? get().activeTerminalId
  if (!target || !get().terminals.some((t) => t.id === target)) return
  if (!get().terminalVisible || get().panelView !== 'terminal') showPanel('terminal')
  set({ renamingTerminalId: target, activeTerminalId: target })
}

/** Applies the typed name; empty goes back to the automatic title. */
export function renameTerminal(id: string, text: string, options: { refocus?: boolean } = {}): void {
  const customTitle = normalizeCustomTitle(text)
  set((s) => ({
    renamingTerminalId: s.renamingTerminalId === id ? null : s.renamingTerminalId,
    terminals: s.terminals.map((t) => (t.id === id ? { ...t, customTitle } : t))
  }))
  // The field disappears and takes the focus with it: the terminal takes it back (on blur focus already moved away).
  if (options.refocus !== false) requestFocus('terminal')
}

export function cancelRenameTerminal(): void {
  set({ renamingTerminalId: null })
  requestFocus('terminal')
}

/** Opens find in the active terminal (⌘F with focus on the terminal). */
export function openTerminalFind(): void {
  const { activeTerminalId, terminalVisible, panelView } = get()
  if (!activeTerminalId) return
  if (!terminalVisible || panelView !== 'terminal') set({ terminalVisible: true, panelView: 'terminal' })
  set({ terminalFindId: activeTerminalId })
  requestFocus(`terminalFind:${activeTerminalId}`)
}

export function closeTerminalFind(): void {
  if (!get().terminalFindId) return
  set({ terminalFindId: null })
  requestFocus('terminal')
}

/** Maximizes the panel (takes the whole main area) or restores it. */
export function togglePanelMaximized(): void {
  const { panelMaximized, terminalVisible, panelView } = get()
  // Closed panel: opens on the current view (on the terminal, ensures one exists).
  if (!terminalVisible && !panelMaximized) showPanel(panelView)
  set({ panelMaximized: !panelMaximized })
  // The editor disappears when maximizing (display: none) and takes the focus: on the terminal, it takes it back.
  if (panelView === 'terminal') requestFocus('terminal')
}

export function togglePanelPosition(): void {
  // The panel only moves in CSS (same elements): the focus stays where it was.
  set((s) => ({ panelPosition: s.panelPosition === 'bottom' ? 'right' : 'bottom' }))
}

/** Opens the bottom panel on the requested view (the terminal one creates the first terminal if there is none). */
export function showPanel(view: PanelView): void {
  if (view === 'terminal' && get().terminals.length === 0) {
    set({ panelView: view, screen: 'workbench' })
    void createTerminal()
    return
  }
  set({ panelView: view, terminalVisible: true, screen: 'workbench' })
}

/** Shortcut of each view: hides the panel if it is already on it, otherwise opens it on it. */
export function togglePanelView(view: PanelView): void {
  const { terminalVisible, panelView, screen } = get()
  // On the Containers screen the panel is hidden: the shortcut shows it instead of closing it.
  if (screen === 'workbench' && terminalVisible && panelView === view)
    set({ terminalVisible: false, panelMaximized: false })
  else showPanel(view)
}

export function hidePanel(): void {
  set({ terminalVisible: false, panelMaximized: false })
}

export function toggleTerminal(): void {
  togglePanelView('terminal')
}

export function activateTerminal(id: string): void {
  if (get().activeTerminalId !== id) set({ activeTerminalId: id })
}

/** Activates the group (tab): the terminal that was already active in it, otherwise the first. */
export function activateTerminalGroup(groupId: string): void {
  const { terminals, activeTerminalId } = get()
  const members = terminals.filter((t) => t.groupId === groupId)
  const [first] = members
  if (!first || members.some((t) => t.id === activeTerminalId)) return
  set({ activeTerminalId: first.id })
}

export function killTerminal(id: string): void {
  api.terminal.kill(id)
  removeTerminal(id)
}

/** Current directory of the terminal shell (`null` if main does not know it or the request fails). */
export async function fetchCwd(id: string): Promise<string | null> {
  return attempt(async () => (await api.terminal.cwd(id)) || null, { quiet: true, fallback: null })
}

/** Kills the active terminal ("Kill Terminal" command). */
export function killActiveTerminal(): void {
  const { activeTerminalId } = get()
  if (activeTerminalId) killTerminal(activeTerminalId)
}

/** Called when the shell process ends (e.g. `exit`). */
export function removeTerminal(id: string): void {
  forgetTerminal(id)
  pendingTitles.delete(id)
  if (pendingCreates > 0 && !get().terminals.some((t) => t.id === id)) exitedEarly.add(id)
  set((s) => {
    const next = removeTerminalFrom(s.terminals, id, s.activeTerminalId)
    // Without terminals the panel only closes if it was on the terminal (Problems and Output stay useful).
    const terminalVisible = s.terminalVisible && (next.terminals.length > 0 || s.panelView !== 'terminal')
    return {
      terminals: next.terminals,
      activeTerminalId: next.activeId,
      terminalFindId: s.terminalFindId === id ? null : s.terminalFindId,
      renamingTerminalId: s.renamingTerminalId === id ? null : s.renamingTerminalId,
      terminalVisible,
      // A hidden panel does not stay maximized: on reopening, the editor stays visible.
      panelMaximized: s.panelMaximized && terminalVisible
    }
  })
}
