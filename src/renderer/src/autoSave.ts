// Auto save (`files.autoSave`). Lives outside the components: reacts to edits (after delay), to the active tab switch
// and to the window losing focus (on focus change).
import { subscribeEdits } from './components/editor/documentState'
import { get, subscribeDiff } from './store'
import type { FileTab } from './types/tabs'
import { selectTab } from './lib/tabSelectors'
import { notify } from './toasts'
import { saveTab } from './saveActions'
import { createReactionScope } from './lib/reactions'
import { shallow } from 'zustand/shallow'

// Never saves on its own a conflicted tab (it would overwrite the external change without asking) nor a deleted one (it
// would recreate the deleted file). Diff tabs have no editing.
function eligible(id: string): FileTab | null {
  const tab = selectTab(id)(get())
  if (!tab || tab.kind !== 'file' || !tab.dirty || tab.conflict || tab.deleted) return null
  return tab
}

export function startAutoSave(): () => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const saving = new Set<string>()
  // Tabs whose last attempt failed (already warned): one warning per tab until a write succeeds.
  const failed = new Set<string>()

  const cancel = (id: string): void => {
    const timer = timers.get(id)
    if (timer) clearTimeout(timer)
    timers.delete(id)
  }
  const cancelAll = (): void => {
    for (const id of [...timers.keys()]) cancel(id)
  }

  const save = async (id: string): Promise<void> => {
    cancel(id)
    // Nothing writes while the save dialog is open; on close, the store triggers the rescheduling.
    if (get().confirmingSave || saving.has(id) || !eligible(id)) return
    saving.add(id)
    try {
      const ok = await saveTab(id, {
        auto: true,
        onError: (message) => {
          if (!failed.has(id)) notify(message)
        }
      })
      if (ok) failed.delete(id)
      else failed.add(id)
    } finally {
      saving.delete(id)
    }
    // Edited during the write: that edit's timer was ignored (tab in `saving`), so reschedule.
    if (!failed.has(id)) schedule(id)
  }

  const schedule = (id: string): void => {
    cancel(id)
    if (get().settings['files.autoSave'] !== 'afterDelay' || !eligible(id)) return
    timers.set(
      id,
      setTimeout(() => void save(id), get().settings['files.autoSaveDelay'])
    )
  }

  const saveAllDirty = (): void => {
    for (const tab of get().tabs) if (tab.kind === 'file' && tab.dirty) void save(tab.id)
  }

  const scope = createReactionScope()
  scope.add(subscribeEdits((id) => schedule(id)))

  scope.add(
    subscribeDiff(
      (s) => ({
        mode: s.settings['files.autoSave'],
        confirmingSave: s.confirmingSave,
        tabs: s.tabs,
        activeTabId: s.activeTabId
      }),
      (s, prev) => {
        // Dialog closed ("Cancel" or a partial "Save"): whatever stayed dirty goes back to the after-delay queue.
        if (prev.confirmingSave && !s.confirmingSave && s.mode === 'afterDelay')
          for (const tab of s.tabs) schedule(tab.id)
        if (s.mode !== prev.mode) {
          cancelAll()
          // Turning on the after-delay mode schedules what was already dirty.
          if (s.mode === 'afterDelay') for (const tab of s.tabs) schedule(tab.id)
        }
        if (s.mode === 'onFocusChange' && s.activeTabId !== prev.activeTabId && prev.activeTabId)
          void save(prev.activeTabId)
        // A tab that became clean (saved by hand, undone) no longer needs the timer.
        if (s.tabs !== prev.tabs) {
          for (const id of [...timers.keys()]) if (!eligible(id)) cancel(id)
          const open = new Set(s.tabs.map((t) => t.id))
          for (const id of [...failed]) if (!open.has(id)) failed.delete(id)
        }
      },
      shallow
    )
  )

  const onBlur = (): void => {
    if (get().settings['files.autoSave'] === 'onFocusChange') saveAllDirty()
  }
  window.addEventListener('blur', onBlur)
  scope.add(() => window.removeEventListener('blur', onBlur))
  scope.add(cancelAll)

  return scope.stop
}
