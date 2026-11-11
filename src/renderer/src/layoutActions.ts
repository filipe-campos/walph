import type { SidebarView } from '@shared/types'
import { clampSidebarWidth, clampPanelHeight, clampPanelWidth, clampClaudeWidth } from './lib/session'
import { set, get } from './store'
import { requestFocus } from './focusBridge'
import { requestOnce } from './requests'

export function showView(view: SidebarView): void {
  set({
    view,
    // Choosing an activity bar view returns the screen to the normal layout (Containers takes over the screen).
    screen: 'workbench',
    sidebarVisible: true
  })
  if (view === 'search') requestOnce('searchFocus')
}

/** Dragging the sidebar divider (`delta` in px). */
export function resizeSidebar(delta: number): void {
  set((s) => ({ sidebarWidth: clampSidebarWidth(s.sidebarWidth + delta) }))
}

/** Dragging the panel divider: moving up (negative delta) enlarges it. */
export function resizePanel(delta: number): void {
  set((s) => ({ panelHeight: clampPanelHeight(s.panelHeight - delta, window.innerHeight) }))
}

/** Dragging the right panel divider: moving left (negative delta) widens it. */
export function resizePanelWidth(delta: number): void {
  set((s) => ({ panelWidth: clampPanelWidth(s.panelWidth - delta, window.innerWidth) }))
}

/** Dragging the secondary sidebar divider: moving left (negative delta) widens it. */
export function resizeClaude(delta: number): void {
  set((s) => ({ claudeWidth: clampClaudeWidth(s.claudeWidth - delta, window.innerWidth) }))
}

export function toggleSidebar(view?: SidebarView): void {
  const s = get()
  // On the Containers screen the click only returns to the layout (with the requested view, or as it was).
  if (s.screen !== 'workbench') {
    if (view) showView(view)
    else set({ screen: 'workbench' })
    return
  }
  if (view && view !== s.view) showView(view)
  else set({ sidebarVisible: !s.sidebarVisible })
}

/** Opens find in the active Claude session (⌘F with focus on the panel). */
export function openClaudeFind(): void {
  const id = get().claude.activeId
  if (!id) return
  // Hidden panel: show it first, so ClaudeFind mounts already active.
  if (!get().claudeVisible || get().screen !== 'workbench') set({ claudeVisible: true, screen: 'workbench' })
  set({ claudeFindId: id })
  requestFocus(`claudeFind:${id}`)
}

export function closeClaudeFind(): void {
  if (get().claudeFindId) set({ claudeFindId: null })
}
