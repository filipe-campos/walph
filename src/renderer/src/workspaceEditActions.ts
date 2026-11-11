// `WorkspaceEdit` applier shared by rename, code actions and the server `workspace/applyEdit`.
import { Text } from '@codemirror/state'
import { t } from '@shared/i18n'
import type { LspWorkspaceEdit, TextEncoding, TextFile } from '@shared/types'
import { lspDocVersion } from './components/editor/lspSync'
import { hasDocument } from './components/editor/documentState'
import { applyTabEdits } from './components/editor/documentStore'
import { currentState } from './components/editor/groupViews'
import { basename } from './lib/path'
import { createReactionScope } from './lib/reactions'
import { detectEol, serializeDoc, splitLines } from './lib/textFormat'
import { applyOffsetEdits, lspEditsToOffsetEdits } from './lib/workspaceEdit'
import { get } from './store'
import { errorMessage } from './lib/errors'
import type { FileTab } from './types/tabs'
import { chosenEncoding } from './lib/encodings'
import { notify } from './toasts'

const api = window.api

/** Open file tabs (loaded or not). */
export const fileTabs = (): FileTab[] => get().tabs.filter((t): t is FileTab => t.kind === 'file')

interface ApplyResult {
  ok: boolean
  /** Changed files. */
  files: number
  reason?: string
}

/** Documents of the tabs loaded now: the applier rejects the edit if any changed since then. */
export function snapshotDocs(): Map<string, Text> {
  const docs = new Map<string, Text>()
  for (const tab of fileTabs()) {
    const state = hasDocument(tab.id) ? currentState(tab.id) : undefined
    if (state) docs.set(tab.path, state.doc)
  }
  return docs
}

type OffsetEdits = ReturnType<typeof lspEditsToOffsetEdits>
type Plan =
  | { kind: 'tab'; tabId: string; doc: Text; edits: OffsetEdits }
  | { kind: 'disk'; path: string; content: string; encoding: TextEncoding }

/**
 * Applies a `WorkspaceEdit`. Tabs with the file loaded receive the edits in the editor (one undo per file; the tab
 * becomes dirty and the user's unsaved text is respected); the other files are read from disk, edited and rewritten
 * with the original EOL. Everything is computed before any write: if something does not apply (overlapping edits,
 * unreadable file, document changed since the request), nothing is changed. `snapshot` = `snapshotDocs()` at the time
 * of the request; `file.version` (main's version) is checked against `lspSync`'s. Disk is written first and the tabs
 * only receive the edit if every write succeeded; `isCancelled` is checked before writing anything.
 */
export async function applyWorkspaceEdit(
  edit: LspWorkspaceEdit,
  options: { snapshot?: Map<string, Text>; isCancelled?: () => boolean } = {}
): Promise<ApplyResult> {
  const root = get().root
  const files = edit.files.filter((f) => f.edits.length > 0)
  if (files.length === 0) return { ok: true, files: 0 }
  const fail = (reason: string): ApplyResult => ({ ok: false, files: 0, reason })
  const loadedTab = (path: string): FileTab | undefined => fileTabs().find((t) => t.path === path && hasDocument(t.id))

  // 1. Files without a loaded tab come from disk.
  const disk = new Map<string, TextFile>()
  try {
    await Promise.all(
      files
        .filter((f) => !loadedTab(f.path))
        .map(async (f) => {
          // Closed or not yet read tabs with a chosen encoding: read and rewrite in the same encoding (BOM/UTF-16).
          const tab = fileTabs().find((t) => t.path === f.path)
          disk.set(f.path, await api.fs.readText(f.path, chosenEncoding(tab)))
        })
    )
  } catch (err) {
    return fail(errorMessage(err))
  }
  if (get().root !== root) return fail(t().lsp.edit.folderChanged)

  // 2. No `await` from here until the editor write: what was computed holds for what is in the tabs.
  const plans: Plan[] = []
  try {
    for (const file of files) {
      const tab = loadedTab(file.path)
      if (tab) {
        const doc = currentState(tab.id)!.doc
        if (file.version !== undefined && file.version !== lspDocVersion(file.path)) throw new Error(t().lsp.edit.stale)
        const before = options.snapshot?.get(file.path)
        if (before && before !== doc && !before.eq(doc))
          throw new Error(t().lsp.edit.changedWhileWaiting(basename(file.path)))
        plans.push({ kind: 'tab', tabId: tab.id, doc, edits: lspEditsToOffsetEdits(doc, file.edits) })
        continue
      }
      const read = disk.get(file.path)
      if (read === undefined) throw new Error(t().lsp.edit.closedDuring(basename(file.path)))
      const text = read.text
      const doc = Text.of(splitLines(text))
      const next = applyOffsetEdits(doc.toString(), lspEditsToOffsetEdits(doc, file.edits))
      plans.push({
        kind: 'disk',
        path: file.path,
        content: serializeDoc(Text.of(splitLines(next)), detectEol(text)),
        encoding: read.encoding
      })
    }
  } catch (err) {
    return fail(errorMessage(err))
  }

  // 3. Main already answered "not applied" to the server: write nothing.
  if (options.isCancelled?.()) return fail(t().lsp.edit.expired)

  // 4. Disk first: if something fails, the tabs stay intact.
  const written: string[] = []
  const failures: string[] = []
  await Promise.all(
    plans.map(async (plan) => {
      if (plan.kind !== 'disk') return
      try {
        await api.fs.writeFile(plan.path, plan.content, plan.encoding)
        written.push(basename(plan.path))
      } catch (err) {
        failures.push(`${basename(plan.path)}: ${errorMessage(err)}`)
      }
    })
  )
  const total = plans.length
  if (failures.length > 0) {
    const list = failures.join('; ')
    const reason =
      written.length > 0 ? t().lsp.edit.writeFailedPartial(list, written.join(', ')) : t().lsp.edit.writeFailed(list)
    return { ok: false, files: written.length, reason }
  }

  // 5. Tabs (synchronous). If one changed during the writes, report what was already applied.
  let applied = written.length
  // Expired during the writes: the disk cannot be undone, but the tabs do not get an edit the server deems rejected.
  if (options.isCancelled?.() && plans.some((p) => p.kind === 'tab'))
    return { ok: false, files: applied, reason: t().lsp.edit.expiredDuring }
  // Validates every tab before applying any: tabs are all or nothing.
  const tabPlans = plans.filter((p): p is Extract<Plan, { kind: 'tab' }> => p.kind === 'tab')
  for (const plan of tabPlans) {
    const doc = currentState(plan.tabId)?.doc
    if (!doc || (doc !== plan.doc && !doc.eq(plan.doc))) {
      const reason = t().lsp.edit.partiallyApplied(applied, total)
      return { ok: false, files: applied, reason }
    }
  }
  for (const plan of tabPlans) {
    applyTabEdits(plan.tabId, plan.edits)
    applied++
  }
  return { ok: true, files: total }
}

/** Server `workspace/applyEdit`: applies and answers (main gives up after 10 s, reports via `onApplyEditCancelled`). */
export function watchLspEdits(): () => void {
  const cancelled = new Set<number>()
  const scope = createReactionScope()
  scope.add(api.lsp.onApplyEditCancelled((id) => cancelled.add(id)))
  scope.add(
    api.lsp.onApplyEdit(({ id, edit }) => {
      const isCancelled = (): boolean => cancelled.has(id)
      void applyWorkspaceEdit(edit, { snapshot: snapshotDocs(), isCancelled })
        .then((result) => {
          // Cancelled: main already answered the server.
          if (isCancelled()) return
          api.lsp.applyEditResult(id, result.ok, result.reason)
          if (!result.ok) notify(t().lsp.errors.server(result.reason ?? ''))
        })
        .catch((err) => {
          if (!isCancelled()) api.lsp.applyEditResult(id, false, errorMessage(err))
        })
        .finally(() => cancelled.delete(id))
    })
  )
  return scope.stop
}
