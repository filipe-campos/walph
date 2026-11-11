import { isNonEmptyString, isRecord } from '@shared/guards'
import type { LspCodeAction, LspCommand, LspRange } from '@shared/types'
import { t } from '@shared/i18n'
import { asRange } from './shape'
import { normalizeWorkspaceEdit, type EditContext } from './workspaceEdit'

/** Too many commands and actions do not fit in a menu; the server returns the rest again with a smaller range. */
export const CODE_ACTION_LIMIT = 100

function normalizeCommand(raw: unknown): LspCommand | null {
  if (!isRecord(raw) || typeof raw.title !== 'string' || typeof raw.command !== 'string' || raw.command === '') {
    return null
  }
  return Array.isArray(raw.arguments)
    ? { title: raw.title, command: raw.command, arguments: raw.arguments }
    : { title: raw.title, command: raw.command }
}

/**
 * `Command | CodeAction` → `LspCodeAction`. A bare `Command` becomes an action with only `command`. An edit Walph
 * cannot apply (files created/renamed/deleted, outside the folder) does not bring down the list: the action is
 * disabled with the reason.
 */
export function normalizeCodeAction(raw: unknown, ctx: EditContext): LspCodeAction | null {
  if (!isRecord(raw) || typeof raw.title !== 'string' || raw.title === '') return null
  // Old form: `command` is the command string (and the whole object is the `Command`).
  if (typeof raw.command === 'string') {
    const command = normalizeCommand(raw)
    return command ? { title: raw.title, command } : null
  }
  const action: LspCodeAction = { title: raw.title }
  if (typeof raw.kind === 'string') action.kind = raw.kind
  if (raw.isPreferred === true) action.isPreferred = true
  if (isRecord(raw.disabled)) {
    action.disabled = isNonEmptyString(raw.disabled.reason) ? raw.disabled.reason : t().lsp.edit.unavailable
  }
  const command = normalizeCommand(raw.command)
  if (command) action.command = command
  if (raw.edit !== undefined && raw.edit !== null) {
    try {
      const edit = normalizeWorkspaceEdit(raw.edit, ctx)
      if (edit.files.length > 0) action.edit = edit
    } catch (err) {
      action.disabled ??= err instanceof Error ? err.message : t().lsp.edit.cannotApply
    }
  }
  return action
}

/** Action with neither `edit` nor `command` and no disabled reason: only useful if the server resolves it. */
export function needsResolve(raw: unknown, action: LspCodeAction): boolean {
  return isRecord(raw) && !action.edit && !action.command && action.disabled === undefined
}

/** After the resolve attempt: an action with nothing to do does not show up. */
export function isActionable(action: LspCodeAction): boolean {
  return action.edit !== undefined || action.command !== undefined || action.disabled !== undefined
}

const before = (a: { line: number; character: number }, b: { line: number; character: number }): boolean =>
  a.line < b.line || (a.line === b.line && a.character < b.character)

/** The server's raw diagnostics touching `range` (edges included): the `codeAction` `context`. */
export function diagnosticsForRange(diagnostics: readonly unknown[], range: LspRange): unknown[] {
  return diagnostics.filter((d) => {
    const r = isRecord(d) ? asRange(d.range) : null
    return r !== null && !before(r.end, range.start) && !before(range.end, r.start)
  })
}
