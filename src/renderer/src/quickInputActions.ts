import { quickInputMode } from './lib/quickOpenQuery'
import { type State, set, get } from './store'
import type { QuickPicker, StashAction } from './types/quickInput'

// Each opening has a new session: the panel key changes and the local state (initial selection) resets, even when
// closing and reopening fall into the same React batch (e.g. running "Select theme" from the palette).
let quickSession = 0

/** An open quick input closes the modal below and discards the theme preview of the previous picker. */
const OPENING = { overlay: null, themePreview: null } as const

/** Opens the `picker` (with `patch` in the same `set`) and returns its session. */
export function showPicker(picker: QuickPicker, patch: Partial<State> = {}, stashAction?: StashAction): number {
  const session = ++quickSession
  set({ quickInput: { query: '', picker, ...(stashAction && { stashAction }), session }, ...OPENING, ...patch })
  return session
}

/** If `picker` is the open one, closes it and returns `true` (the same key toggles). */
export function closePickerIfOpen(picker: QuickPicker): boolean {
  if (get().quickInput?.picker !== picker) return false
  closeQuickInput()
  return true
}

/** Toggles the picker: open closes; otherwise opens if `canOpen()` allows. */
export function togglePicker(picker: QuickPicker, canOpen: () => boolean = () => true): void {
  if (closePickerIfOpen(picker) || !canOpen()) return
  showPicker(picker)
}

export function openThemePicker(): void {
  togglePicker('theme')
}

export function openRecentPicker(): void {
  togglePicker('recent')
}

/**
 * Opens the quick input with `prefix` (`''` files, `'>'` commands, `':'` line). If it is already open in the same mode,
 * closes it (shortcut toggle); if it is in another mode, switches the query to the prefix.
 */
export function openQuickInput(prefix: string): void {
  const current = get().quickInput
  // Open in the unified palette without a prefix: ⌘P (Files) does not close, switches mode; prefixed ones follow
  // the rule.
  const unifiedHome = !!current?.unified && quickInputMode(current.query) === 'files'
  if (current && !current.picker && !unifiedHome && quickInputMode(current.query) === quickInputMode(prefix))
    return closeQuickInput()
  // Switching mode with the panel open keeps the session (and the focus to restore); only the theme picker resets.
  set({
    quickInput: { query: prefix, session: current && !current.picker ? current.session : ++quickSession },
    ...OPENING
  })
}

/**
 * ⌘K: opens the unified palette. Open and without a prefix, closes (toggle); open in another mode, goes back to
 * unified mode.
 */
export function openUnifiedPalette(): void {
  const current = get().quickInput
  if (current?.unified && !current.picker && quickInputMode(current.query) === 'files') return closeQuickInput()
  set({
    quickInput: { query: '', unified: true, session: current && !current.picker ? current.session : ++quickSession },
    ...OPENING
  })
}

export function closeQuickInput(): void {
  if (get().quickInput) set({ quickInput: null, themePreview: null })
}

export function setQuickInputQuery(query: string): void {
  const current = get().quickInput
  if (current) set({ quickInput: { ...current, query } })
}

export function toggleCommandPalette(): void {
  openQuickInput('>')
}

/** Asks for the URL of the repository to clone; works without an open folder. */
export function openCloneUrlPicker(): void {
  showPicker('cloneUrl')
}
