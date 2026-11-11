import { get } from '../../store'
import { getView, shownTabId } from './groupViews'

// Focuses the active group editor if the active tab is already the one shown (cursor intact).
export function focusEditor(): void {
  const { activeTabId, activeGroupId } = get()
  const shown = shownTabId(activeGroupId)
  if (shown && shown === activeTabId) getView(activeGroupId)?.focus()
}
