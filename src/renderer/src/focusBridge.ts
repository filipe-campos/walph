// Bridge between actions (outside React) and the UI regions they need to test or focus: components
// register the region element on mount, actions ask by name. No action queries the DOM by selector.
export type FocusRegion =
  | 'editorSlot'
  | 'tree'
  | 'panelContainer'
  | 'panelTab'
  | 'claudePanel'
  | 'claudeNewConversation'
  | 'diffEditor'
  | 'containersView'
  | 'containerDetail'
  | 'containersSearch'
  | `claudeCard:${string}`

/** Returns `true` if it focused something. Without it, the region focuses its own element. */
type FocusFn = (el: HTMLElement) => boolean

interface Handle {
  el: HTMLElement
  focus?: FocusFn | undefined
}

export interface FocusSnapshot {
  el: HTMLElement
  /** The focus came from the keyboard (`:focus-visible`). */
  viaKeyboard: boolean
}

const regions = new Map<FocusRegion, Set<Handle>>()

/** Registers the element of a region (there may be several, e.g. one diff per group); returns the disposer. */
export function registerRegion(region: FocusRegion, el: HTMLElement, focus?: FocusFn): () => void {
  const handle: Handle = { el, focus }
  const set = regions.get(region) ?? new Set<Handle>()
  set.add(handle)
  regions.set(region, set)
  return () => {
    set.delete(handle)
    if (set.size === 0 && regions.get(region) === set) regions.delete(region)
  }
}

function regionOf(el: Element | null, region: FocusRegion): boolean {
  if (!el) return false
  for (const handle of regions.get(region) ?? []) if (handle.el.contains(el)) return true
  return false
}

/** Is the focus inside the region? */
export function hasFocus(region: FocusRegion): boolean {
  return regionOf(document.activeElement, region)
}

/** Focuses the region; with several, tries the last one in document order. `false` if none accepted the focus. */
export function focusRegion(region: FocusRegion): boolean {
  const handles = [...(regions.get(region) ?? [])].sort((a, b) =>
    a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  )
  for (const { el, focus } of handles.reverse()) {
    if (focus) {
      if (focus(el)) return true
    } else {
      el.focus()
      return true
    }
  }
  return false
}

/** Releases the focus if it is inside the region. */
export function blurRegion(region: FocusRegion): void {
  const active = document.activeElement
  if (active instanceof HTMLElement && regionOf(active, region)) active.blur()
}

/** Stores the focused element if it is inside the region (to give the focus back later). */
export function captureFocus(region: FocusRegion): FocusSnapshot | null {
  const active = document.activeElement
  if (!(active instanceof HTMLElement) || !regionOf(active, region)) return null
  return { el: active, viaKeyboard: active.matches(':focus-visible') }
}

/** Gives the focus back to the stored element, if it is still on the page. */
export function restoreFocus(snapshot: FocusSnapshot | null): boolean {
  if (!snapshot?.el.isConnected) return false
  snapshot.el.focus()
  return true
}

/** Focus requests to whoever is already mounted and decides alone what to focus (search field, terminal). */
export type FocusTarget = 'terminal' | `terminalFind:${string}` | `claudeFind:${string}`

const targets = new Map<FocusTarget, Set<() => void>>()

/** The component registers what to do when someone asks for its focus; returns the disposer. */
export function registerFocusTarget(target: FocusTarget, run: () => void): () => void {
  const set = targets.get(target) ?? new Set<() => void>()
  set.add(run)
  targets.set(target, set)
  return () => {
    set.delete(run)
    if (set.size === 0 && targets.get(target) === set) targets.delete(target)
  }
}

/** Asks the target for focus. `false` if nobody registered it (not mounted: on mount, the component focuses itself). */
export function requestFocus(target: FocusTarget): boolean {
  const runs = targets.get(target)
  if (!runs?.size) return false
  for (const run of [...runs]) run()
  return true
}
