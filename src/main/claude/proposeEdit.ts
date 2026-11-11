import { isRecord, isNonEmptyString } from '@shared/guards'

// Computes the text a Claude edit tool (Edit/MultiEdit/Write) would leave in the file, so the renderer shows the diff
// BEFORE the CLI writes. Pure: the caller reads the disk. On any doubt it returns `ok: false` and the request falls
// back to the generic tool card (we never show a diff the CLI would not produce).

export type EditProposal = { ok: true; path: string; proposed: string } | { ok: false; reason: string }

export const EDIT_TOOLS: ReadonlySet<string> = new Set(['Edit', 'MultiEdit', 'Write'])

interface Replacement {
  oldString: string
  newString: string
  replaceAll: boolean
}

/** Path the tool will change (`file_path`), or `null` if the input has none. */
export function editTargetPath(input: unknown): string | null {
  if (!isRecord(input)) return null
  const p = input.file_path
  return isNonEmptyString(p) ? p : null
}

function parseReplacement(v: unknown): Replacement | null {
  if (!isRecord(v) || typeof v.old_string !== 'string' || typeof v.new_string !== 'string') return null
  return { oldString: v.old_string, newString: v.new_string, replaceAll: v.replace_all === true }
}

function countOccurrences(text: string, needle: string): number {
  let count = 0
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + needle.length)) count++
  return count
}

/** Applies one replacement like the CLI: `old_string` must exist and be unique, unless with `replace_all`. */
function applyOne(text: string, r: Replacement): { ok: true; text: string } | { ok: false; reason: string } {
  if (r.oldString === r.newString) return { ok: false, reason: 'old_string and new_string are equal' }
  if (r.oldString === '') {
    // Only creates a new/empty file (the CLI rejects an empty `old_string` in a file with content).
    return text === ''
      ? { ok: true, text: r.newString }
      : { ok: false, reason: 'empty old_string in a file with content' }
  }
  const count = countOccurrences(text, r.oldString)
  if (count === 0) return { ok: false, reason: 'old_string not found' }
  if (count > 1 && !r.replaceAll) return { ok: false, reason: 'old_string appears more than once' }
  // `split/join` instead of `replace`: `$&` and the like in `new_string` are not special patterns.
  return { ok: true, text: text.split(r.oldString).join(r.newString) }
}

function applyAll(text: string, list: Replacement[]): { ok: true; text: string } | { ok: false; reason: string } {
  let current = text
  for (const r of list) {
    const next = applyOne(current, r)
    if (!next.ok) return next
    current = next.text
  }
  return { ok: true, text: current }
}

/**
 * `original` = current file content, or `null` if it does not exist. CRLF files are handled normalized (the model's
 * `old_string` usually comes with LF) and go back to CRLF.
 */
export function proposeEdit(toolName: string, input: unknown, original: string | null): EditProposal {
  const path = editTargetPath(input)
  if (!path || !isRecord(input)) return { ok: false, reason: 'input without file_path' }

  if (toolName === 'Write') {
    return typeof input.content === 'string'
      ? { ok: true, path, proposed: input.content }
      : { ok: false, reason: 'Write without content' }
  }

  let list: Replacement[]
  if (toolName === 'Edit') {
    const r = parseReplacement(input)
    if (!r) return { ok: false, reason: 'Edit with invalid input' }
    list = [r]
  } else if (toolName === 'MultiEdit') {
    if (!Array.isArray(input.edits) || input.edits.length === 0) return { ok: false, reason: 'MultiEdit without edits' }
    const parsed = input.edits.map(parseReplacement)
    if (parsed.some((r) => r === null)) return { ok: false, reason: 'MultiEdit with an invalid edit' }
    list = parsed as Replacement[]
  } else {
    return { ok: false, reason: `tool ${toolName} is not an edit tool` }
  }

  const base = original ?? ''
  const direct = applyAll(base, list)
  if (direct.ok) return { ok: true, path, proposed: direct.text }

  if (base.includes('\r\n')) {
    const normalized = applyAll(
      base.replace(/\r\n/g, '\n'),
      list.map((r) => ({
        ...r,
        oldString: r.oldString.replace(/\r\n/g, '\n'),
        newString: r.newString.replace(/\r\n/g, '\n')
      }))
    )
    if (normalized.ok) return { ok: true, path, proposed: normalized.text.replace(/\n/g, '\r\n') }
  }
  return { ok: false, reason: direct.reason }
}
