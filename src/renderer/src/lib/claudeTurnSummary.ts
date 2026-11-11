// Claude turn summary: changed files (notices and the panel's final summary) with the +N −N lines. Pure.
import { isNonEmptyString, isRecord } from '@shared/guards'
import { t } from '@shared/i18n'
import type { ClaudeBlock, ClaudeMessage } from '@shared/types'
import { userText } from './claudeConversation'

/** CLI tools that write to a file. */
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
/** IDE `openDiff` (`walph` MCP server): writes only if the user accepts. */
const OPEN_DIFF_TOOL = 'mcp__walph__openDiff'
/** Start of the result of an accepted `openDiff` (`claude/ideServer.ts`); the rejection is not `isError` either. */
const ACCEPTED = 'The user accepted'

type ToolUse = Extract<ClaudeBlock, { type: 'toolUse' }>
type ToolResult = Extract<ClaudeBlock, { type: 'toolResult' }>

function pathOf(input: unknown): string | null {
  if (!isRecord(input)) return null
  for (const key of ['file_path', 'notebook_path', 'filePath']) {
    const value = input[key]
    if (isNonEmptyString(value)) return value
  }
  return null
}

function changed(use: ToolUse, result: ToolResult | undefined): boolean {
  if (use.name === OPEN_DIFF_TOOL) return !!result && !result.isError && result.content.trimStart().startsWith(ACCEPTED)
  // An edit that failed or was denied changed nothing; without a result yet (in progress) it counts.
  return EDIT_TOOLS.has(use.name) && !result?.isError
}

/** Index of the first message of the current turn: the one after the last user text message (of the main agent). */
export function turnStartIndex(messages: readonly ClaudeMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m?.role === 'user' && m.parentToolUseId === null && !m.taskNotification && userText(m) !== '') return i + 1
  }
  return 0
}

/** Edit calls of the turn that actually changed (or may have changed) files, with the result when it already exists. */
function turnEdits(messages: readonly ClaudeMessage[]): { use: ToolUse; result: ToolResult | undefined }[] {
  const turn = messages.slice(turnStartIndex(messages))
  const results = new Map<string, ToolResult>()
  for (const m of turn) for (const b of m.blocks) if (b.type === 'toolResult') results.set(b.toolUseId, b)

  const edits: { use: ToolUse; result: ToolResult | undefined }[] = []
  for (const m of turn) {
    if (m.role !== 'assistant') continue
    for (const b of m.blocks) {
      if (b.type !== 'toolUse') continue
      const result = results.get(b.toolUseId)
      if (changed(b, result)) edits.push({ use: b, result })
    }
  }
  return edits
}

/** Unique paths (in the order they appeared) of the files changed since the last user text message. */
export function turnChangedFiles(messages: readonly ClaudeMessage[]): string[] {
  const files = new Set<string>()
  for (const { use } of turnEdits(messages)) {
    const path = pathOf(use.input)
    if (path) files.add(path)
  }
  return [...files]
}

// ---------- Line count (+N −N) ----------

/**
 * Lines of a text as the diff sees them: `\r\n` normalized, the final break does not make an empty line, empty text = 0
 * lines.
 */
function toLines(text: string): string[] {
  const t = text.replace(/\r\n?/g, '\n')
  if (t === '') return []
  return (t.endsWith('\n') ? t.slice(0, -1) : t).split('\n')
}

/** Above this (LCS table cells) the exact count gets expensive: falls back to "everything replaced". */
const MAX_LCS_CELLS = 4_000_000
/** LCS cells that a whole turn may spend (the summary recomputes on every render of the end of the turn). */
export const TURN_LCS_BUDGET = 8_000_000

/**
 * Lines added and removed when replacing `oldText` with `newText` (line diff by the longest common subsequence, the
 * same
 * result as `git diff --numstat` for a contiguous block). Equal prefix/suffix go out before the LCS: edits are short.
 */
export function lineDiffCounts(
  oldText: string,
  newText: string,
  /** Shared LCS cell budget (a whole turn): exhausted, it falls back to "everything replaced". */
  budget?: { cells: number }
): { added: number; removed: number } {
  const a = toLines(oldText)
  const b = toLines(newText)
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const n = endA - start
  const m = endB - start
  if (n === 0 || m === 0) return { added: m, removed: n }
  if (n * m > MAX_LCS_CELLS || (budget && n * m > budget.cells)) return { added: m, removed: n }
  if (budget) budget.cells -= n * m

  // Only the LCS length matters: two table rows are enough.
  let prev = new Uint32Array(m + 1)
  let cur = new Uint32Array(m + 1)
  for (let i = 1; i <= n; i++) {
    const line = a[start + i - 1]
    for (let j = 1; j <= m; j++) {
      cur[j] = line === b[start + j - 1] ? (prev[j - 1] ?? 0) + 1 : Math.max(prev[j] ?? 0, cur[j - 1] ?? 0)
    }
    ;[prev, cur] = [cur, prev]
  }
  const common = prev[m] ?? 0
  return { added: m - common, removed: n - common }
}

/** File changed in the turn, with the added/removed lines summed from the edit calls. */
export interface TurnFile {
  path: string
  added: number
  removed: number
  /** `replace_all`: the count is per occurrence (the total of replacements is not in the block). */
  replaceAll: boolean
  /** `Write` over a file that already existed: the removed lines are unknown (only the new content is in the block). */
  overwrite: boolean
  /** No count possible (notebook, `openDiff`): show only the name. */
  uncounted: boolean
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

/** "File created successfully…" = new file; any other `Write` result (or the CLI text changing) = overwrite. */
function wroteNewFile(result: ToolResult | undefined): boolean {
  return !result || /created/i.test(result.content.slice(0, 80))
}

/** Count of one call, or `null` when the block does not allow it. */
function countsOf(
  use: ToolUse,
  result: ToolResult | undefined,
  budget: { cells: number }
): { added: number; removed: number; replaceAll?: boolean; overwrite?: boolean } | null {
  const input = record(use.input)
  switch (use.name) {
    case 'Edit': {
      const counts = lineDiffCounts(str(input.old_string), str(input.new_string), budget)
      return input.replace_all === true ? { ...counts, replaceAll: true } : counts
    }
    case 'MultiEdit': {
      const edits = Array.isArray(input.edits) ? input.edits : []
      let added = 0
      let removed = 0
      let replaceAll = false
      for (const raw of edits) {
        const e = record(raw)
        const counts = lineDiffCounts(str(e.old_string), str(e.new_string), budget)
        added += counts.added
        removed += counts.removed
        if (e.replace_all === true) replaceAll = true
      }
      return { added, removed, replaceAll }
    }
    case 'Write': {
      const added = toLines(str(input.content)).length
      return wroteNewFile(result) ? { added, removed: 0 } : { added, removed: 0, overwrite: true }
    }
    default:
      return null
  }
}

/**
 * Files changed in the turn (order of appearance) with `+N −N` summed per file, from the `Edit`/`MultiEdit`/`Write`
 * blocks that neither failed nor were denied. Limitation: repeated edits on the same file add up (there is no file
 * before/after the turn), so the total may exceed `git diff`.
 */
export function turnSummary(messages: readonly ClaudeMessage[]): TurnFile[] {
  const files = new Map<string, TurnFile>()
  const budget = { cells: TURN_LCS_BUDGET }
  for (const { use, result } of turnEdits(messages)) {
    const path = pathOf(use.input)
    if (!path) continue
    const file = files.get(path) ?? {
      path,
      added: 0,
      removed: 0,
      replaceAll: false,
      overwrite: false,
      uncounted: true
    }
    const counts = countsOf(use, result, budget)
    if (counts) {
      file.added += counts.added
      file.removed += counts.removed
      file.replaceAll ||= !!counts.replaceAll
      file.overwrite ||= !!counts.overwrite
      file.uncounted = false
    }
    files.set(path, file)
  }
  return [...files.values()]
}

/** "1 arquivo alterado" / "N arquivos alterados". */
export function filesChangedLabel(count: number): string {
  return t().claude.turnSummary.filesChanged(count)
}

/** "<session> · N arquivos alterados" (without the count part when nothing changed). */
export function turnToastDescription(title: string, changedCount: number): string {
  if (changedCount <= 0) return title
  return `${title} · ${filesChangedLabel(changedCount)}`
}
