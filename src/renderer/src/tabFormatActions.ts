import { t } from '@shared/i18n'
import type { TextEncoding } from '@shared/types'
import { trackPending } from './lib/pendingWork'
import { reindentEdits } from './lib/textFormat'
import type { Eol, Indent } from './lib/textFormat'
import { setDocumentIndent, applyLanguage } from './components/editor/documentConfig'
import { matchesSaved, notifyEdit, hasDocument } from './components/editor/documentState'
import { applyTabEdits } from './components/editor/documentStore'
import { currentState } from './components/editor/groupViews'
import { loadLanguage } from './lib/language'
import { basename } from './lib/path'
import { get, patchTab, findFileTab } from './store'
import { withAutoSaveSuspended, confirmDialog, saveTab } from './saveActions'
import { attempt } from './attempt'
import { notify } from './toasts'
import { clearFormatDirty, formatDirtyEol, markFormatDirty, syncTabWithDisk, reloadWithEncoding } from './diskSync'
import { planEolChange } from './lib/eolChange'
import { refreshBaseline } from './gitBaselineActions'
import { togglePicker } from './quickInputActions'
import { activeLoadedFileTab } from './tabActions'

/** Stores the EOL, indentation and encoding read when the file is loaded in the editor. */
export function setTabFormat(
  id: string,
  eol: Eol,
  indent: Indent,
  indentFallback: boolean,
  encoding: TextEncoding
): void {
  patchTab(id, { eol, indent, indentFallback, encoding })
}

/** Status bar: toggles LF ↔ CRLF. Makes the tab dirty; the next write uses the new EOL. */
export function setTabEol(id: string, eol: Eol): void {
  const tab = findFileTab(id)
  if (!tab || tab.eol === null || tab.eol === eol) return
  const plan = planEolChange({
    tabEol: tab.eol,
    next: eol,
    diskEol: formatDirtyEol(id),
    dirty: tab.dirty,
    conflict: tab.conflict,
    textSaved: () => {
      const doc = currentState(id)?.doc.toString()
      return doc !== undefined && matchesSaved(id, doc) === true
    }
  })
  switch (plan.kind) {
    case 'ignore':
      return
    // Back to the disk line ending: the tab stays dirty only if the text also changed.
    case 'restore-disk':
      clearFormatDirty(id)
      if (!plan.clean) return patchTab(id, { eol })
      patchTab(id, { eol, dirty: false })
      // It was in conflict: clean, the tab adopts the disk (same path as undoing back to the base in `setDirty`).
      if (plan.resync) void syncTabWithDisk(id)
      return
    case 'diverge':
      markFormatDirty(id, plan.diskEol)
      patchTab(id, { eol, dirty: true, preview: false })
      // It did not go through the editor: without this the after-delay auto save would never see the tab dirty.
      if (plan.announce) notifyEdit(id)
  }
}

/** Status bar: changes only the tab's indent setting (the text is not touched). */
export function setTabIndent(id: string, indent: Indent): void {
  const tab = findFileTab(id)
  if (!tab?.indent) return
  // User choice: the tab stops following `editor.tabSize`/`insertSpaces`.
  patchTab(id, { indent, indentFallback: false })
  setDocumentIndent(id, indent)
}

/** "Convert Indentation to Spaces/Tabs": rewrites the leading indent of the lines in one transaction (one undo). */
export function convertTabIndent(id: string, kind: Indent['kind']): void {
  const tab = findFileTab(id)
  const state = currentState(id)
  if (!tab?.indent || !state) return
  // Width of a tab: the indent size in spaces, or `editor.tabSize` when the tab uses tabs.
  const width = tab.indent.kind === 'spaces' ? tab.indent.size : get().settings['editor.tabSize']
  const edits = reindentEdits(state.doc.toString(), kind, width)
  if (edits.length === 0) notify(t().editor.file.nothingToConvert, 'info')
  else applyTabEdits(id, edits)
  setTabIndent(id, kind === 'tabs' ? { kind: 'tabs' } : { kind: 'spaces', size: width })
}

/** Status bar: the tab's language mode (`null` = detect by extension again). LSP stays keyed by path. */
export async function setTabLanguage(id: string, language: string | null): Promise<void> {
  const tab = findFileTab(id)
  if (!tab) return
  patchTab(id, { language })
  if (!hasDocument(id)) return
  await attempt(
    async () => {
      const support = await loadLanguage(tab.path, language)
      // Another choice (or the tab closing) won while the parser was loading.
      if (findFileTab(id)?.language !== language || !hasDocument(id)) return
      applyLanguage(id, support)
    },
    { format: (message) => t().editor.language.loadFailed(message) }
  )
}

/** "Reopen with Encoding": rereads the file forcing the encoding. A dirty tab asks to confirm (drops the edits). */
export function reopenWithEncoding(id: string, encoding: TextEncoding): Promise<void> {
  return trackPending('reopen', reopenNow(id, encoding))
}

async function reopenNow(id: string, encoding: TextEncoding): Promise<void> {
  const tab = findFileTab(id)
  if (!tab || !hasDocument(id)) return
  if (tab.dirty) {
    // Suspends auto save: the blur caused by the dialog would write what the user may be discarding.
    const ok = await withAutoSaveSuspended(() =>
      confirmDialog({
        message: t().editor.file.discardForEncoding(basename(tab.path)),
        detail: t().editor.file.discardForEncodingDetail,
        confirmLabel: t().editor.file.discardAndReopen,
        destructive: true
      })
    )
    if (!ok) return
  }
  // The disk did not change, but the index must be decoded with the new encoding (gutter).
  if (await reloadWithEncoding(tab, encoding)) void refreshBaseline(id)
}

/** "Save with Encoding": writes with it; if the write fails the tab keeps the previous encoding. */
export async function saveWithEncoding(id: string, encoding: TextEncoding): Promise<boolean> {
  const saved = await saveTab(id, { encoding })
  if (saved) void refreshBaseline(id)
  return saved
}

/** Language mode picker for the active tab (QuickInput). */
export function openLanguagePicker(): void {
  togglePicker('language', () => !!activeLoadedFileTab())
}

/** "Reopen/Save with Encoding" picker for the active tab (QuickInput). */
export function openEncodingPicker(): void {
  togglePicker('encoding', () => !!activeLoadedFileTab())
}

/** Toggles the line ending of the active tab (LF ↔ CRLF). */
export function toggleActiveEol(): void {
  const tab = activeLoadedFileTab()
  if (tab) setTabEol(tab.id, tab.eol === 'CRLF' ? 'LF' : 'CRLF')
}
