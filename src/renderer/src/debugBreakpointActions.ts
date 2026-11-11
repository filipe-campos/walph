// Breakpoints: the store is the source (it goes into the folder session); main receives the active list of each file
// and the editor gutter receives the markers. Also binds the gutter to the store (`debugHost`) and the stopped line
// highlight.
import { shallow } from 'zustand/shallow'
import type { DebugBreakpointStatus } from '@shared/types'
import { hasDocument } from './components/editor/documentState'
import { dispatchEffects } from './components/editor/groupViews'
import { bindDebugHost, unbindDebugHost } from './components/editor/debugHost'
import { openBreakpointInput, setBreakpointMarks, setStoppedLine } from './components/editor/breakpointGutter'
import {
  breakpointMarks,
  moveBreakpoints,
  removeBreakpoint,
  setBreakpointEnabled,
  setBreakpointFields,
  toSourceBreakpoints,
  toggleBreakpoint,
  type Breakpoint,
  type BreakpointFields
} from './lib/debugBreakpoints'
import { samePath } from './lib/path'
import { createReactionScope } from './lib/reactions'
import { activeFile } from './lspNavigationActions'
import { get, onRootChange, onTabsClosed, set, subscribeDiff, useStore, type State } from './store'
import { openFile } from './tabActions'

const api = window.api

/** Writes the file list; the adapter's old state does not apply to the new list (it returns on the next event). */
function writeBreakpoints(path: string, list: Breakpoint[]): void {
  set((s) => {
    const breakpoints = { ...s.breakpoints }
    if (list.length > 0) breakpoints[path] = list
    else delete breakpoints[path]
    const { [path]: _stale, ...breakpointStatus } = s.breakpointStatus
    return { breakpoints, breakpointStatus }
  })
}

const listOf = (path: string): Breakpoint[] => get().breakpoints[path] ?? []

function toggleBreakpointAt(path: string, line: number): void {
  writeBreakpoints(path, toggleBreakpoint(listOf(path), line))
}

export function setBreakpointFieldsAt(path: string, line: number, fields: BreakpointFields): void {
  writeBreakpoints(path, setBreakpointFields(listOf(path), line, fields))
}

export function setBreakpointEnabledAt(path: string, line: number, enabled: boolean): void {
  writeBreakpoints(path, setBreakpointEnabled(listOf(path), line, enabled))
}

export function removeBreakpointAt(path: string, line: number): void {
  writeBreakpoints(path, removeBreakpoint(listOf(path), line))
}

export function removeAllBreakpoints(): void {
  set({ breakpoints: {}, breakpointStatus: {} })
}

/** Enables or disables all of them (section header). */
export function setAllBreakpointsEnabled(enabled: boolean): void {
  set((s) => ({
    breakpoints: Object.fromEntries(
      Object.entries(s.breakpoints).map(([path, list]) => [path, list.map((b) => ({ ...b, enabled }))])
    ),
    breakpointStatus: {}
  }))
}

export function setBreakpointStatus(path: string, statuses: DebugBreakpointStatus[]): void {
  set((s) => ({ breakpointStatus: { ...s.breakpointStatus, [path]: statuses } }))
}

export function clearBreakpointStatus(): void {
  if (Object.keys(get().breakpointStatus).length > 0) set({ breakpointStatus: {} })
}

export function revealBreakpoint(path: string, line: number): void {
  openFile(path, { line, column: 0, length: 0 }, { preview: true })
}

/** F9: toggles the breakpoint on the cursor line of the active editor. */
export function toggleBreakpointAtCursor(): void {
  const file = activeFile()
  if (!file) return
  const { state } = file.view
  toggleBreakpointAt(file.path, state.doc.lineAt(state.selection.main.head).number)
}

/** Opens the condition field on the cursor line of the active editor. */
export function addConditionalBreakpointAtCursor(): void {
  const file = activeFile()
  if (!file) return
  const { state } = file.view
  openBreakpointInput(file.view, state.doc.lineAt(state.selection.main.head).number)
}

const pathOfTab = (tabId: string): string | null => {
  const tab = get().tabs.find((t) => t.id === tabId)
  return tab?.kind === 'file' ? tab.path : null
}

/** File and line of the focused frame (the stopped line highlight), or `null`. */
function stoppedLocation(s: Pick<State, 'debugFocus' | 'debugFrames'>): { path: string; line: number } | null {
  const focus = s.debugFocus
  if (focus?.frameId == null || focus.threadId === null) return null
  const frame = s.debugFrames[`${focus.sessionId}:${focus.threadId}`]?.find((f) => f.id === focus.frameId)
  return frame?.path ? { path: frame.path, line: frame.line } : null
}

function stoppedLineOf(path: string): number | null {
  const location = stoppedLocation(get())
  return location && samePath(location.path, path, api.platform) ? location.line : null
}

function marksOf(path: string) {
  return breakpointMarks(listOf(path), get().breakpointStatus[path])
}

function bindHost(): void {
  bindDebugHost({
    marksFor: (tabId) => {
      const path = pathOfTab(tabId)
      return path ? marksOf(path) : []
    },
    stoppedLineFor: (tabId) => {
      const path = pathOfTab(tabId)
      return path ? stoppedLineOf(path) : null
    },
    toggle: (tabId, line) => {
      const path = pathOfTab(tabId)
      if (path) toggleBreakpointAt(path, line)
    },
    fieldsAt: (tabId, line) => {
      const path = pathOfTab(tabId)
      const bp = path ? listOf(path).find((b) => b.line === line) : undefined
      return bp ? omitEmpty(bp) : {}
    },
    setFields: (tabId, line, fields) => {
      const path = pathOfTab(tabId)
      if (path) setBreakpointFieldsAt(path, line, fields)
    },
    moved: (tabId, moves) => {
      const path = pathOfTab(tabId)
      if (path) writeBreakpoints(path, moveBreakpoints(listOf(path), moves))
    }
  })
}

function omitEmpty(bp: Breakpoint): BreakpointFields {
  return {
    ...(bp.condition && { condition: bp.condition }),
    ...(bp.hitCondition && { hitCondition: bp.hitCondition }),
    ...(bp.logMessage && { logMessage: bp.logMessage })
  }
}

export function startDebugBreakpointReactions(): () => void {
  const scope = createReactionScope()
  scope.bindGlobal(bindHost, unbindDebugHost)

  // What main has for each file (active ones only): resends only what changed.
  const sent = new Map<string, string>()
  const sync = (map: State['breakpoints']): void => {
    const paths = new Set([...sent.keys(), ...Object.keys(map)])
    for (const path of paths) {
      const source = toSourceBreakpoints(map[path] ?? [])
      const text = JSON.stringify(source)
      if ((sent.get(path) ?? '[]') === text) continue
      if (source.length === 0) sent.delete(path)
      else sent.set(path, text)
      api.debug.setBreakpoints(path, source)
    }
  }
  sync(get().breakpoints)
  scope.add(useStore.subscribe((s) => s.breakpoints, sync))
  // Main resets its map when the folder changes: what was sent before no longer applies.
  scope.add(onRootChange(() => sent.clear()))

  // Markers in the gutter of each loaded tab; tabs loaded later are born with them (`debugHost`).
  const markSigs = new Map<string, string>()
  const stoppedSigs = new Map<string, number | null>()
  const refreshMarks = (): void => {
    for (const tab of get().tabs) {
      if (tab.kind !== 'file' || !hasDocument(tab.id)) continue
      const marks = marksOf(tab.path)
      const sig = JSON.stringify(marks)
      if (markSigs.get(tab.id) === sig) continue
      markSigs.set(tab.id, sig)
      dispatchEffects(tab.id, [setBreakpointMarks.of(marks)])
    }
  }
  const refreshStopped = (): void => {
    for (const tab of get().tabs) {
      if (tab.kind !== 'file' || !hasDocument(tab.id)) continue
      const line = stoppedLineOf(tab.path)
      if ((stoppedSigs.get(tab.id) ?? null) === line) continue
      stoppedSigs.set(tab.id, line)
      dispatchEffects(tab.id, [setStoppedLine.of(line)])
    }
  }
  scope.add(
    useStore.subscribe((s) => [s.breakpoints, s.breakpointStatus, s.tabs], refreshMarks, { equalityFn: shallow })
  )
  scope.add(
    subscribeDiff(
      (s) => [stoppedLocation(s)?.path ?? null, stoppedLocation(s)?.line ?? null, s.tabs] as const,
      refreshStopped,
      shallow
    )
  )
  scope.add(
    onTabsClosed((ids) => {
      for (const id of ids) {
        markSigs.delete(id)
        stoppedSigs.delete(id)
      }
    })
  )
  return scope.stop
}
