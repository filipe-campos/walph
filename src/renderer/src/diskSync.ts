import { detectEol } from './lib/textFormat'
import type { Eol } from './lib/textFormat'
import { createLatestByKey } from './lib/latest'
import { t } from '@shared/i18n'
import type { TextEncoding, TextFile, FileChange } from '@shared/types'
import { matchesSaved } from './components/editor/documentState'
import { replaceDocument } from './components/editor/documentStore'
import { lastChangeFor } from './lib/fileChanges'
import { decideDiskSync } from './lib/diskSyncDecision'
import { patchTab, findFileTab, get, onTabsClosed } from './store'
import { readEncodingFor, resolveTabIndent } from './editorConfigActions'
import type { FileTab } from './types/tabs'
import { errorMessage } from './lib/errors'
import { basename } from './lib/path'
import { trackPending } from './lib/pendingWork'
import { notify } from './toasts'

const api = window.api

// Tabs dirty only because the user changed the line ending: the text is still the same as on disk, so the `dirty`
// computed by the editor (document ≠ base) does not see them.
// Value = the disk line ending, so switching back to it from the bar cleans the tab (if the text is the saved one too).
const formatDirty = new Map<string, Eol>()

// Last read started per tab: discards responses from older reads.
const diskReads = createLatestByKey<string>()
// Tabs whose last read failed while the file exists (already warned).
const readFailures = new Set<string>()

export function markFormatDirty(tabId: string, diskEol: Eol): void {
  formatDirty.set(tabId, diskEol)
}

export function clearFormatDirty(tabId: string): void {
  formatDirty.delete(tabId)
}

/** Disk line ending of a tab dirty only by format; `undefined` = the tab is not in that state. */
export function formatDirtyEol(tabId: string): Eol | undefined {
  return formatDirty.get(tabId)
}

/** Starts a disk read for the tab and invalidates the previous ones. */
export function beginDiskRead(tabId: string): number {
  return diskReads.next(tabId)
}

export function isDiskReadCurrent(tabId: string, seq: number): boolean {
  return diskReads.isCurrent(tabId, seq)
}

export function markDeleted(tabId: string): void {
  patchTab(tabId, { deleted: true })
}

/** Reads the tab's file; `null` if the read was superseded, the tab changed or the file is gone (marked deleted). */
async function readTabFromDisk(tabId: string): Promise<{ tab: FileTab; text: string; encoding: TextEncoding } | null> {
  const tab = findFileTab(tabId)
  if (!tab) return null
  const seq = beginDiskRead(tabId)
  let file: TextFile
  try {
    // The user's chosen encoding (or EditorConfig's latin1) applies to rereads; otherwise main detects it by the BOM.
    file = await api.fs.readText(tab.path, readEncodingFor(tab))
  } catch (err) {
    if (!diskReads.isCurrent(tabId, seq) || findFileTab(tabId)?.path !== tab.path) return null
    // It is "deleted" only if the file really does not exist; a large, binary or unreadable file is another problem.
    if (await api.fs.exists(tab.path).catch(() => true)) {
      // One warning per tab until the next read succeeds (a log past the limit changes every second).
      if (diskReads.isCurrent(tabId, seq) && !readFailures.has(tabId)) {
        readFailures.add(tabId)
        notify(t().editor.file.readFailed(basename(tab.path), errorMessage(err)))
      }
    } else if (diskReads.isCurrent(tabId, seq)) markDeleted(tabId)
    return null
  }
  readFailures.delete(tabId)
  const current = findFileTab(tabId)
  if (!current || current.path !== tab.path || !diskReads.isCurrent(tabId, seq)) return null
  return { tab: current, text: file.text, encoding: file.encoding }
}

function applyDiskText(tab: FileTab, text: string, encoding: TextEncoding, chosen = tab.encodingChosen): void {
  const eol = detectEol(text)
  const { indent, fallback } = resolveTabIndent(tab.id, text)
  // Before the replace: the synchronous dispatch calls setDirty(false), which must not see the tab still dirty (not
  // even by format), or it would reread the disk with the old encoding and undo a "Reopen with encoding".
  clearFormatDirty(tab.id)
  patchTab(tab.id, { dirty: false, encoding, encodingChosen: chosen })
  replaceDocument(tab.id, text, indent)
  patchTab(tab.id, {
    dirty: false,
    deleted: false,
    conflict: false,
    eol,
    indent,
    indentFallback: fallback,
    encoding,
    encodingChosen: chosen
  })
}

/** Rereads the disk and reconciles the tab (reloads if clean, marks a conflict if dirty, rechecked after the read). */
export function syncTabWithDisk(tabId: string): Promise<void> {
  return trackPending('disk', syncNow(tabId))
}

async function syncNow(tabId: string): Promise<void> {
  const read = await readTabFromDisk(tabId)
  if (!read) return
  const { tab, text, encoding } = read
  // Exists on disk (an `add` may have recreated a file marked as deleted).
  if (tab.deleted) patchTab(tabId, { deleted: false })
  const same = matchesSaved(tabId, text)
  switch (decideDiskSync(same, tab.dirty)) {
    // Never loaded in the editor: it will be read from disk when first shown.
    case 'skip':
      return
    // Same as the base: it was our own write (or nothing actually changed).
    case 'clear-conflict':
      return void patchTab(tabId, { conflict: false })
    case 'adopt-format': {
      // Only the EOL/indent changed externally (e.g. unix2dos): a clean tab adopts the new format so saving keeps it.
      const { indent, fallback } = resolveTabIndent(tabId, text)
      return void patchTab(tabId, { conflict: false, eol: detectEol(text), indent, indentFallback: fallback, encoding })
    }
    case 'mark-conflict':
      return void patchTab(tabId, { conflict: true })
    case 'reload':
      return applyDiskText(tab, text, encoding)
  }
}

/**
 * "Reopen with encoding": rereads the file forcing `encoding` and adopts the text. `tab` is the tab as it was when
 * requested. `true` = applied.
 */
export async function reloadWithEncoding(tab: FileTab, encoding: TextEncoding): Promise<boolean> {
  const id = tab.id
  const seq = beginDiskRead(id)
  try {
    const file = await api.fs.readText(tab.path, encoding)
    const current = findFileTab(id)
    if (!current || current.path !== tab.path || !diskReads.isCurrent(id, seq)) return false
    // Tab clean at request time that was edited during the read: does not discard what the user just typed.
    if (!tab.dirty && current.dirty) {
      notify(t().editor.file.editedDuringRead, 'info')
      return false
    }
    readFailures.delete(id)
    applyDiskText(current, file.text, file.encoding, true)
    return true
  } catch (err) {
    notify(t().editor.file.reopenFailed(basename(tab.path), errorMessage(err)))
    return false
  }
}

/** Reacts to the watcher batch: the last event touching each open tab decides what to do with it. */
export function syncTabsWithDisk(files: FileChange[]): void {
  if (files.length === 0) return
  for (const tab of get().tabs) {
    if (tab.kind !== 'file') continue
    const last = lastChangeFor(tab.path, files)
    if (last === 'unlink') {
      beginDiskRead(tab.id)
      markDeleted(tab.id)
    } else if (last) void syncTabWithDisk(tab.id)
  }
}

/** "Reload from disk" in the conflict bar: discards the editor version. */
export async function reloadFromDisk(tabId: string): Promise<void> {
  const read = await readTabFromDisk(tabId)
  if (read) return applyDiskText(read.tab, read.text, read.encoding)
  // No read: either the file is gone (tab already marked deleted), and the conflict bar no longer makes sense.
  if (findFileTab(tabId)?.deleted) {
    patchTab(tabId, { conflict: false })
    notify(t().editor.file.goneFromDisk)
  }
}

/** "Keep my version": the tab stays dirty and the next write overwrites the disk. */
export function keepMyVersion(tabId: string): void {
  patchTab(tabId, { conflict: false })
}

export function startDiskSyncReactions(): () => void {
  return onTabsClosed((ids) => {
    for (const id of ids) {
      diskReads.forget(id)
      readFailures.delete(id)
      clearFormatDirty(id)
    }
  })
}
