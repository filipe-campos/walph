// Debugger: sessions (as main reports them), focused frame, on-demand variables, watch, Debug Console and the main
// events. Breakpoints live in `debugBreakpointActions.ts`.
import { t } from '@shared/i18n'
import type {
  DebugControl,
  DebugEvent,
  DebugSessionInfo,
  DebugStackFrame,
  DebugStartOptions,
  DebugEvaluateContext
} from '@shared/types'
import { attempt } from './attempt'
import { clearBreakpointStatus, setBreakpointStatus } from './debugBreakpointActions'
import { appendEntry, appendOutput, type ConsoleEntry } from './lib/debugConsole'
import { chooseFocusedSession, pickTopFrame, rootSessionOf } from './lib/debugSessions'
import { errorMessage } from './lib/errors'
import { createReactionScope } from './lib/reactions'
import { showView } from './layoutActions'
import { activeFile } from './lspNavigationActions'
import { togglePicker } from './quickInputActions'
import { get, onRootChange, set, subscribeDiff } from './store'
import { openFile } from './tabActions'
import { createTerminal } from './terminalActions'
import { notify } from './toasts'
import type { DebugFocus } from './types/debug'

const api = window.api

let consoleSeq = 0
const nextConsoleId = (): number => ++consoleSeq

/** Session of the last `stopped` (focus returns to it while it lives). */
let lastStopped: string | null = null
// Each stop/continue of a session invalidates the responses requested before it (threads, stack, scopes, variables).
const epochs = new Map<string, number>()
const bump = (sessionId: string): number => {
  const next = (epochs.get(sessionId) ?? 0) + 1
  epochs.set(sessionId, next)
  return next
}
const epochOf = (sessionId: string): number => epochs.get(sessionId) ?? 0
const pendingVariables = new Set<number>()

const framesKey = (sessionId: string, threadId: number): string => `${sessionId}:${threadId}`

function focusedSession(): DebugSessionInfo | null {
  const { debugSessions, debugFocus } = get()
  return debugSessions.find((s) => s.id === debugFocus?.sessionId) ?? null
}

function pushConsole(entry: Omit<ConsoleEntry, 'id'>): void {
  set((s) => ({ debugConsole: appendEntry(s.debugConsole, entry, nextConsoleId) }))
}

export function clearDebugConsole(): void {
  set({ debugConsole: [] })
}

// ---------- Configurations ----------

export async function loadDebugConfigurations(): Promise<void> {
  const root = get().root
  if (!root) return
  const list = await attempt(() => api.debug.configurations(), { fallback: null })
  if (list && get().root === root) set({ debugConfigs: list })
}

export function selectDebugConfig(name: string): void {
  set({ debugSelectedConfig: name })
}

/** Name of the configuration to start: the chosen one if it still exists, otherwise the first. */
function currentConfigName(): string | null {
  const { debugConfigs, debugSelectedConfig } = get()
  const list = debugConfigs?.configurations ?? []
  return list.find((c) => c.name === debugSelectedConfig)?.name ?? list[0]?.name ?? null
}

export function openDebugConfigPicker(): void {
  void loadDebugConfigurations()
  togglePicker('debugConfig', () => !!get().root)
}

/** Opens `.vscode/launch.json` (created from a template if missing). */
export async function openLaunchJson(): Promise<void> {
  const path = await attempt(() => api.debug.createLaunchFile())
  if (!path) return
  openFile(path)
  void loadDebugConfigurations()
}

// ---------- Sessions ----------

function startOptions(noDebug: boolean): DebugStartOptions {
  const file = activeFile()
  const options: DebugStartOptions = noDebug ? { noDebug: true } : {}
  if (!file) return options
  const { state } = file.view
  const selection = state.selection.main
  return {
    ...options,
    file: file.path,
    line: state.doc.lineAt(selection.head).number,
    ...(!selection.empty && { selectedText: state.sliceDoc(selection.from, selection.to) })
  }
}

export async function startDebugging(options: { noDebug?: boolean; name?: string } = {}): Promise<void> {
  if (!get().root) return notify(t().debug.errors.noFolder)
  await loadDebugConfigurations()
  const name = options.name ?? currentConfigName()
  if (!name) {
    notify(t().debugUi.errors.noConfiguration, 'info')
    openDebugConfigPicker()
    return
  }
  const first = get().debugSessions.length === 0
  const started = await attempt(() => api.debug.start(name, startOptions(!!options.noDebug)))
  if (started && first) showView('debug')
}

/** Session the toolbar and the commands control (and its thread). */
function controlTarget(): { session: DebugSessionInfo; threadId: number | null } | null {
  const session = focusedSession()
  if (!session) return null
  const focus = get().debugFocus
  return { session, threadId: focus?.sessionId === session.id ? focus.threadId : session.stoppedThreadId }
}

export async function debugControl(action: DebugControl): Promise<void> {
  const target = controlTarget()
  if (!target) return
  // Steps and "continue" only make sense when stopped; pause, only when running.
  if (action === 'pause' ? target.session.state !== 'running' : target.session.state !== 'stopped') return
  await attempt(() => api.debug.control(target.session.id, action, target.threadId))
}

/** F5 during the session: continues if stopped (does nothing while running, as in VS Code). */
export function continueOrStart(): void {
  if (focusedSession()) void debugControl('continue')
  else void startDebugging()
}

export async function stopDebugging(sessionId?: string): Promise<void> {
  const id = sessionId ?? focusedSession()?.id
  if (!id) return
  await attempt(() => api.debug.stop(rootSessionOf(get().debugSessions, id)))
}

export async function restartDebugging(): Promise<void> {
  const session = focusedSession()
  if (!session) return
  await attempt(() => api.debug.restart(rootSessionOf(get().debugSessions, session.id)))
}

// ---------- Frames, scopes and variables ----------

/** Focuses a frame: its scopes, watch reevaluated and (optionally) the file opened at the line. */
export async function focusFrame(
  sessionId: string,
  threadId: number,
  frame: DebugStackFrame | null,
  reveal: boolean
): Promise<void> {
  const focus: DebugFocus = { sessionId, threadId, frameId: frame?.id ?? null }
  set({ debugFocus: focus, debugScopes: [] })
  if (reveal && frame?.path) {
    openFile(frame.path, { line: frame.line, column: Math.max(0, frame.column - 1), length: 0 }, { preview: true })
  }
  void refreshWatches()
  if (!frame) return
  const epoch = epochOf(sessionId)
  const scopes = await attempt(() => api.debug.scopes(sessionId, frame.id), { fallback: [] })
  if (epochOf(sessionId) !== epoch || get().debugFocus !== focus) return
  set({ debugScopes: scopes })
}

/** Stack of a thread (when expanded in the Call Stack). */
export async function loadThreadFrames(sessionId: string, threadId: number): Promise<void> {
  const epoch = epochOf(sessionId)
  const frames = await attempt(() => api.debug.stackTrace(sessionId, threadId), { fallback: null })
  if (!frames || epochOf(sessionId) !== epoch) return
  set((s) => ({ debugFrames: { ...s.debugFrames, [framesKey(sessionId, threadId)]: frames } }))
}

/** Children of a variable/scope, once per stop. */
export async function loadVariables(reference: number): Promise<void> {
  const session = focusedSession()
  if (!session || session.state !== 'stopped' || reference <= 0) return
  if (pendingVariables.has(reference) || get().debugVariables[reference]) return
  pendingVariables.add(reference)
  const epoch = epochOf(session.id)
  try {
    const children = await attempt(() => api.debug.variables(session.id, reference), { fallback: [], quiet: true })
    if (epochOf(session.id) !== epoch) return
    set((s) => ({ debugVariables: { ...s.debugVariables, [reference]: children } }))
  } finally {
    pendingVariables.delete(reference)
  }
}

export function setVariableExpanded(key: string, open: boolean): void {
  set((s) => ({ debugExpanded: { ...s.debugExpanded, [key]: open } }))
}

// ---------- Watch and console ----------

async function evaluate(
  expression: string,
  context: DebugEvaluateContext
): Promise<{ value: string; error: boolean; variablesReference: number } | null> {
  const focus = get().debugFocus
  if (!focus) return null
  try {
    const result = await api.debug.evaluate(focus.sessionId, expression, focus.frameId, context)
    return { value: result.result, error: false, variablesReference: result.variablesReference }
  } catch (err) {
    return { value: errorMessage(err), error: true, variablesReference: 0 }
  }
}

/** Reevaluates the expressions in the focused frame; without a stopped session, the values disappear. */
async function refreshWatches(): Promise<void> {
  const { debugWatches } = get()
  const session = focusedSession()
  if (!session || session.state !== 'stopped' || debugWatches.length === 0) {
    if (Object.keys(get().debugWatchResults).length > 0) set({ debugWatchResults: {} })
    return
  }
  const focus = get().debugFocus
  const results = await Promise.all(debugWatches.map((expr) => evaluate(expr, 'watch')))
  if (get().debugFocus !== focus) return
  const map: Record<string, { value: string; error: boolean; variablesReference: number }> = {}
  debugWatches.forEach((expr, i) => {
    const result = results[i]
    if (result) map[expr] = result
  })
  set({ debugWatchResults: map })
}

export function addWatch(expression: string): void {
  const expr = expression.trim()
  if (!expr || get().debugWatches.includes(expr)) return
  set((s) => ({ debugWatches: [...s.debugWatches, expr] }))
  void refreshWatches()
}

export function editWatch(previous: string, expression: string): void {
  const expr = expression.trim()
  if (!expr) return removeWatch(previous)
  set((s) => ({ debugWatches: [...new Set(s.debugWatches.map((w) => (w === previous ? expr : w)))] }))
  void refreshWatches()
}

export function removeWatch(expression: string): void {
  set((s) => ({ debugWatches: s.debugWatches.filter((w) => w !== expression) }))
}

export function removeAllWatches(): void {
  set({ debugWatches: [], debugWatchResults: {} })
}

/** Enter in the Debug Console. */
export async function evaluateInConsole(expression: string): Promise<void> {
  const expr = expression.trim()
  if (!expr) return
  if (!get().debugFocus) return notify(t().debugUi.errors.noSession, 'info')
  pushConsole({ kind: 'input', text: expr })
  const result = await evaluate(expr, 'repl')
  if (!result) return
  pushConsole(
    result.error
      ? { kind: 'error', text: result.value }
      : { kind: 'result', text: result.value, variablesReference: result.variablesReference }
  )
}

// ---------- Main events ----------

function onSessions(sessions: DebugSessionInfo[]): void {
  const alive = new Set(sessions.map((s) => s.id))
  for (const id of [...epochs.keys()]) if (!alive.has(id)) epochs.delete(id)
  if (lastStopped && !alive.has(lastStopped)) lastStopped = null
  if (sessions.length === 0) {
    pendingVariables.clear()
    set({
      debugSessions: [],
      debugFocus: null,
      debugThreads: {},
      debugFrames: {},
      debugScopes: [],
      debugVariables: {},
      debugWatchResults: {}
    })
    clearBreakpointStatus()
    return
  }
  set((s) => {
    const keep = <T>(record: Record<string, T>, idOf: (key: string) => string): Record<string, T> =>
      Object.fromEntries(Object.entries(record).filter(([key]) => alive.has(idOf(key))))
    const focusAlive = s.debugFocus && alive.has(s.debugFocus.sessionId)
    const chosen = focusAlive ? null : chooseFocusedSession(sessions, lastStopped)
    const chosenInfo = sessions.find((x) => x.id === chosen)
    return {
      debugSessions: sessions,
      debugThreads: keep(s.debugThreads, (key) => key),
      debugFrames: keep(s.debugFrames, (key) => key.slice(0, key.lastIndexOf(':'))),
      ...(!focusAlive && {
        debugFocus: chosen ? { sessionId: chosen, threadId: chosenInfo?.stoppedThreadId ?? null, frameId: null } : null,
        debugScopes: [],
        debugVariables: {}
      })
    }
  })
}

async function onStopped(event: Extract<DebugEvent, { kind: 'stopped' }>): Promise<void> {
  const { sessionId } = event
  lastStopped = sessionId
  const epoch = bump(sessionId)
  pendingVariables.clear()
  set({ debugVariables: {} })
  const threads = await attempt(() => api.debug.threads(sessionId), { fallback: [], quiet: true })
  if (epochOf(sessionId) !== epoch) return
  set((s) => ({ debugThreads: { ...s.debugThreads, [sessionId]: threads } }))
  const threadId = event.threadId ?? threads[0]?.id ?? null
  if (threadId === null) return
  const frames = await attempt(() => api.debug.stackTrace(sessionId, threadId), { fallback: [] })
  if (epochOf(sessionId) !== epoch) return
  set((s) => ({ debugFrames: { ...s.debugFrames, [framesKey(sessionId, threadId)]: frames } }))
  if (event.reason === 'exception' && event.description) pushConsole({ kind: 'error', text: event.description })
  await focusFrame(sessionId, threadId, pickTopFrame(frames), true)
}

function onContinued(sessionId: string): void {
  bump(sessionId)
  pendingVariables.clear()
  set((s) => {
    const prefix = `${sessionId}:`
    const debugFrames = Object.fromEntries(Object.entries(s.debugFrames).filter(([key]) => !key.startsWith(prefix)))
    const focused = s.debugFocus?.sessionId === sessionId
    return {
      debugFrames,
      ...(focused &&
        s.debugFocus && { debugFocus: { ...s.debugFocus, frameId: null }, debugScopes: [], debugVariables: {} })
    }
  })
}

function handleDebugEvent(event: DebugEvent): void {
  switch (event.kind) {
    case 'sessions':
      return onSessions(event.sessions)
    case 'stopped':
      return void onStopped(event)
    case 'continued':
      return onContinued(event.sessionId)
    case 'threads': {
      const session = get().debugSessions.find((s) => s.id === event.sessionId)
      if (session?.state !== 'stopped') return
      const epoch = epochOf(event.sessionId)
      void attempt(() => api.debug.threads(event.sessionId), { fallback: null, quiet: true }).then((threads) => {
        if (threads && epochOf(event.sessionId) === epoch)
          set((s) => ({ debugThreads: { ...s.debugThreads, [event.sessionId]: threads } }))
      })
      return
    }
    case 'output':
      set((s) => ({ debugConsole: appendOutput(s.debugConsole, event.entries, nextConsoleId) }))
      return
    case 'breakpoints':
      return setBreakpointStatus(event.path, event.breakpoints)
    case 'runInTerminal':
      void createTerminal({ debugRun: event.ticket, title: event.title })
      return
    case 'error':
      notify(event.message)
      pushConsole({ kind: 'error', text: event.message })
      return
  }
}

/** Debugger events coming from main (`ipcReactions.ts`). */
export function watchDebug(): () => void {
  return api.debug.onEvent(handleDebugEvent)
}

export function startDebugReactions(): () => void {
  const scope = createReactionScope()
  // `inDebugMode` context of the shortcuts (F5 continues, F10/F11 step): main starts with `false`.
  let reported = false
  scope.add(
    subscribeDiff(
      (s) => s.debugSessions.length > 0,
      (active) => {
        if (active === reported) return
        reported = active
        api.window.setContext('inDebugMode', active)
      }
    )
  )
  scope.add(
    onRootChange(() => {
      lastStopped = null
      epochs.clear()
      pendingVariables.clear()
    })
  )
  return scope.stop
}
