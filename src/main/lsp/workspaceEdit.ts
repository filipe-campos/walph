import { isRecord } from '@shared/guards'
import type { LspTextEdit, LspWorkspaceEdit } from '@shared/types'
import { t } from '@shared/i18n'
import { asTextEditsStrict, malformedEdit } from './shape'
import { isInside, pathKey } from '@shared/pathCompare'
import { canonicalPath, uriToPath } from './uri'
import { UserError } from '../errors'

export interface EditContext {
  /** Window folder: an edit outside it is refused. */
  root: string
  /** Document open in the mirror: its version and the path it was opened with (`undefined` = not open). */
  versionOf?: (path: string) => number | undefined
  openPath?: (path: string) => string | undefined
  platform?: string
}

/**
 * Server `WorkspaceEdit` → only text edits grouped by file (arrival order preserved), with the path in the
 * renderer's spelling and the mirror version when the file is open. Strict: throws with a translated message if the
 * edit touches files (create/rename/delete), leaves the window folder, was computed for an old version of an open
 * document, has steps over the same file or any malformed part (applying only part of it would leave the project
 * inconsistent).
 */
export function normalizeWorkspaceEdit(raw: unknown, ctx: EditContext): LspWorkspaceEdit {
  if (!isRecord(raw)) throw new UserError(malformedEdit())
  const platform = ctx.platform ?? process.platform
  const byKey = new Map<string, { path: string; edits: LspTextEdit[]; version?: number }>()

  const add = (uri: unknown, edits: LspTextEdit[], version: unknown, sequential: boolean): void => {
    const raw = typeof uri === 'string' ? uriToPath(uri, platform) : null
    if (!raw) throw new UserError(t().lsp.edit.notLocal)
    if (!isInside(ctx.root, raw, { platform })) {
      throw new UserError(t().lsp.edit.outsideWorkspace(raw))
    }
    const current = ctx.versionOf?.(raw)
    if (typeof version === 'number' && current !== undefined && current !== version) {
      throw new UserError(t().lsp.edit.staleRetry)
    }
    const key = pathKey(raw, platform)
    const existing = byKey.get(key)
    // In `documentChanges` each entry applies to the document AFTER the previous one: merging lists breaks the ranges.
    if (existing && sequential) {
      throw new UserError(t().lsp.edit.sequential)
    }
    const entry = existing ?? {
      path: canonicalPath(raw, ctx.root, (p) => ctx.openPath?.(p), platform),
      edits: [],
      ...(current !== undefined ? { version: current } : {})
    }
    entry.edits.push(...edits)
    byKey.set(key, entry)
  }

  // `documentChanges` takes precedence over `changes` (the client declared support for it).
  if (raw.documentChanges !== undefined) {
    if (!Array.isArray(raw.documentChanges)) throw new UserError(malformedEdit())
    for (const change of raw.documentChanges) {
      if (!isRecord(change)) throw new UserError(malformedEdit())
      if (typeof change.kind === 'string') throw new UserError(t().lsp.edit.resourceOperations)
      const doc = change.textDocument
      if (!isRecord(doc)) throw new UserError(malformedEdit())
      add(doc.uri, asTextEditsStrict(change.edits), doc.version, true)
    }
  } else if (raw.changes !== undefined) {
    if (!isRecord(raw.changes)) throw new UserError(malformedEdit())
    for (const [uri, edits] of Object.entries(raw.changes)) add(uri, asTextEditsStrict(edits), undefined, false)
  }

  return { files: [...byKey.values()].filter((f) => f.edits.length > 0) }
}
