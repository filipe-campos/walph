import { t } from '@shared/i18n'
import type { TextEncoding } from '@shared/types'
import { setDocumentIndent } from './components/editor/documentConfig'
import { hasDocument } from './components/editor/documentState'
import { saveDocument } from './components/editor/documentStore'
import { currentState } from './components/editor/groupViews'
import { basename } from './lib/path'
import { findFileTab, patchTab, get, onTabsClosed, set, useStore } from './store'
import type { FileTab } from './types/tabs'
import { attempt } from './attempt'
import { errorMessage } from './lib/errors'
import { createReactionScope } from './lib/reactions'
import { beginDiskRead, clearFormatDirty, formatDirtyEol } from './diskSync'
import { resolveTabIndent, saveFormatFor } from './editorConfigActions'
import { applySaveTransforms } from './saveTransformActions'
import { notify } from './toasts'
import { flushSession } from './sessionActions'

const api = window.api

/** Last write of each tab: a new one waits for the previous, otherwise the older rename may finish last. */
const saveChains = new Map<string, Promise<boolean>>()

interface SaveOptions {
  onError?: (message: string) => void
  encoding?: TextEncoding
  /** Auto save: the whitespace adjustments spare the lines with a cursor. */
  auto?: boolean
}

/**
 * Writes the tab (recreating the file if it was deleted). `false` if the write failed; with `onError` the message goes
 * to the caller instead of `notify` (auto save warns once per tab, not on every attempt).
 */
export async function saveTab(id: string, options: SaveOptions = {}): Promise<boolean> {
  const write = (): Promise<boolean> => writeTab(id, options)
  // A previous write that rejected must not drop the queued ones.
  const run = (saveChains.get(id) ?? Promise.resolve(true)).then(write, write)
  saveChains.set(id, run)
  try {
    return await run
  } finally {
    if (saveChains.get(id) === run) saveChains.delete(id)
  }
}

async function writeTab(id: string, options: SaveOptions): Promise<boolean> {
  const tab = findFileTab(id)
  if (!tab || !hasDocument(id)) return true
  // Before the new base: the written text is already adjusted and the watcher echo matches it.
  applySaveTransforms(id, [], { auto: options.auto ?? false })
  // Invalidates in-flight watcher reads: an old response must not revert the content or raise a false conflict.
  beginDiskRead(id)
  try {
    const format = saveFormatFor(tab, formatDirtyEol(id) !== undefined)
    const encoding = options.encoding ?? format.encoding
    const stillDirty = await saveDocument(id, tab.path, format.eol, encoding)
    beginDiskRead(id)
    if (stillDirty === null) return true
    clearFormatDirty(id)
    patchTab(id, {
      dirty: stillDirty,
      deleted: false,
      conflict: false,
      ...(format.eol !== tab.eol && { eol: format.eol }),
      ...(encoding && encoding !== tab.encoding && { encoding }),
      ...(options.encoding && { encoding: options.encoding, encodingChosen: true })
    })
    // A fallback tab that now has detectable indentation stops following the settings.
    const text = tab.indentFallback ? currentState(id)?.doc.toString() : undefined
    if (text !== undefined) {
      const resolved = resolveTabIndent(id, text)
      if (!resolved.fallback) {
        patchTab(id, { indent: resolved.indent, indentFallback: false })
        setDocumentIndent(id, resolved.indent)
      }
    }
    return true
  } catch (err) {
    const message = t().editor.file.saveFailed(basename(tab.path), errorMessage(err))
    if (options.onError) options.onError(message)
    else notify(message)
    return false
  }
}

async function saveTabs(ids: string[]): Promise<boolean> {
  const results = await Promise.all(ids.map((id) => saveTab(id)))
  return results.every(Boolean)
}

/** Saves the tabs with changes. A deleted, clean tab does not recreate the file (it may be deleted on purpose). */
export async function saveAllTabs(): Promise<void> {
  const ids = get()
    .tabs.filter((t) => t.kind === 'file' && t.dirty)
    .map((t) => t.id)
  await saveTabs(ids)
}

/**
 * Before discarding tabs (close, switch folder, close the window): if any has changes, asks in the native dialog.
 * `true` = may proceed (nothing dirty, "Don't Save", or "Save" with every write successful).
 */
export async function confirmAndSave(tabIds: string[]): Promise<boolean> {
  const wanted = new Set(tabIds)
  const dirty = get().tabs.filter((t): t is FileTab => t.kind === 'file' && t.dirty && wanted.has(t.id))
  if (dirty.length === 0) return true
  // Suspends auto save: the timer or the blur caused by the dialog would write what the user may discard.
  return withAutoSaveSuspended(async () => {
    const choice = await attempt(() => api.dialog.confirmUnsaved(dirty.map((t) => basename(t.path))), {
      fallback: null
    })
    if (choice === null || choice === 'cancel') return false
    if (choice === 'dontSave') return true
    return saveTabs(dirty.map((t) => t.id))
  })
}

/** Dialogs open now (nested ones count) and the window already confirmed to close together decide `confirmingSave`. */
let confirmDepth = 0
let closing = false

function syncAutoSaveSuspended(): void {
  const suspended = confirmDepth > 0 || closing
  if (get().confirmingSave !== suspended) set({ confirmingSave: suspended })
}

/** Runs `fn` with auto save suspended; resumes only when the last nested dialog ends (and the window isn't closing). */
export async function withAutoSaveSuspended<T>(fn: () => Promise<T>): Promise<T> {
  confirmDepth++
  syncAutoSaveSuspended()
  try {
    return await fn()
  } finally {
    confirmDepth--
    syncAutoSaveSuspended()
  }
}

/** Native confirmation dialog; a dialog failure is warned and counts as "no". */
export async function confirmDialog(options: Parameters<typeof api.dialog.confirm>[0]): Promise<boolean> {
  return attempt(() => api.dialog.confirm(options), { fallback: false })
}

let closePrompting = false

/** Main intercepted the window/app close with dirty files. */
export async function handleCloseRequested(): Promise<void> {
  // A second request while the dialog is open is ignored.
  if (closePrompting) return
  closePrompting = true
  try {
    if (await confirmAndSave(get().tabs.map((t) => t.id))) {
      // The window is going to close: auto save stays suspended for good, otherwise a rescheduled timer would write
      // what the user just asked to discard ("Don't Save") before the window is destroyed.
      closing = true
      syncAutoSaveSuspended()
      flushSession()
      api.window.confirmClose()
    } else api.window.cancelClose()
  } finally {
    closePrompting = false
  }
}

/** Chained quit canceled in another window: this one will no longer close, so auto save applies again. */
export function handleCloseAborted(): void {
  closing = false
  syncAutoSaveSuspended()
}

export function startSaveReactions(): () => void {
  const scope = createReactionScope()
  // Notifies main when the window starts (or stops) having dirty files; only sends on change.
  scope.add(
    useStore.subscribe(
      (s) => s.tabs.some((t) => t.kind === 'file' && t.dirty),
      (dirty) => api.window.setDirty(dirty)
    )
  )
  scope.add(
    onTabsClosed((ids) => {
      for (const id of ids) saveChains.delete(id)
    })
  )
  return scope.stop
}
