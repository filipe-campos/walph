// Stage/unstage by hunk or by lines: picks the new index content and builds the unified patch that takes it there
// (`git apply --cached`). Works byte by byte: the text arrives as `latin1` (1 character = 1 byte), so any
// ASCII-compatible encoding (UTF-8, with or without BOM, Windows-1252) passes intact and the patch comes back
// byte-identical.
import { diffLines, type Hunk } from '@shared/lineDiff'
import { selectLines, type LineRange } from '@shared/hunkSelection'

const PATCH_CONTEXT = 3

/** Lines with the terminator (`\n` or `\r\n`); the last one may not have it. */
export function splitRawLines(text: string): string[] {
  const out: string[] = []
  let start = 0
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', start)) {
    out.push(text.slice(start, i + 1))
    start = i + 1
  }
  if (start < text.length) out.push(text.slice(start))
  return out
}

/** CRLF and LF compare equal; a last line without `\n` differs from the same line with `\n` (the patch must say so). */
function lineKey(line: string): string {
  if (line.endsWith('\r\n')) return line.slice(0, -2)
  if (line.endsWith('\n')) return line.slice(0, -1)
  return `${line}\0`
}

function rawHunks(oldLines: readonly string[], newLines: readonly string[]): Hunk[] {
  return diffLines(oldLines.map(lineKey), newLines.map(lineKey))
}

const usesCrlf = (lines: readonly string[]): boolean => lines.some((l) => l.endsWith('\r\n'))

/** An LF-only base receiving CRLF lines (`core.autocrlf`): the brought lines become LF, as `git add` would do. */
function alignEol(incoming: readonly string[], base: readonly string[]): readonly string[] {
  if (base.length === 0 || usesCrlf(base) || !usesCrlf(incoming)) return incoming
  return incoming.map((l) => (l.endsWith('\r\n') ? `${l.slice(0, -2)}\n` : l))
}

/** Every line that is not the last ends in a break: a line "without `\n` at the end" may no longer be the last. */
function terminate(lines: string[]): string[] {
  const eol = lines.find((l) => l.endsWith('\n'))?.endsWith('\r\n') ? '\r\n' : '\n'
  return lines.map((l, i) => (i < lines.length - 1 && !l.endsWith('\n') ? l + eol : l))
}

/**
 * Content (in raw lines) after applying (`apply`, from `oldText`) or reverting (`revert`, from `newText`) the
 * changes of the selected lines of the new side.
 */
export function selectRawLines(
  oldText: string,
  newText: string,
  ranges: readonly LineRange[],
  mode: 'apply' | 'revert'
): string[] {
  let oldLines: readonly string[] = splitRawLines(oldText)
  let newLines: readonly string[] = splitRawLines(newText)
  if (mode === 'apply') newLines = alignEol(newLines, oldLines)
  else oldLines = alignEol(oldLines, newLines)
  return terminate(selectLines(oldLines, newLines, rawHunks(oldLines, newLines), ranges, mode))
}

/** C escape of a character git quotes in the name (control, quotes, backslash), or `null`. */
function escapeChar(c: string): string | null {
  if (c === '"' || c === '\\') return `\\${c}`
  if (c === '\t') return '\\t'
  if (c === '\n') return '\\n'
  const code = c.charCodeAt(0)
  return code < 0x20 || code === 0x7f ? `\\${code.toString(8).padStart(3, '0')}` : null
}

/** Name in the patch header the way git writes it: quoted, with C escapes, when it has a special character. */
function patchPath(prefix: string, rel: string): string {
  // UTF-8 bytes in `latin1`, like the rest of the patch.
  const name = prefix + Buffer.from(rel, 'utf8').toString('latin1')
  let quoted = false
  let out = ''
  for (const c of name) {
    const escaped = escapeChar(c)
    if (escaped !== null) quoted = true
    out += escaped ?? c
  }
  return quoted ? `"${out}"` : name
}

function emit(prefix: ' ' | '-' | '+', line: string): string {
  return line.endsWith('\n') ? `${prefix}${line}` : `${prefix}${line}\n\\ No newline at end of file\n`
}

/** `@@ -a,b +c,d @@`: with 0 lines the start is the line before the point (0 at the start of the file). */
function range(start: number, count: number): string {
  return `${count === 0 ? start : start + 1},${count}`
}

/**
 * Unified patch from `oldLines` to `newLines` (raw lines) of a file `rel` (relative to the root, with `/`), with
 * `context` lines of context; `null` if there is no difference.
 */
export function buildPatch(
  rel: string,
  oldLines: readonly string[],
  newLines: readonly string[],
  context = PATCH_CONTEXT
): string | null {
  const groups: { head: Hunk; tail: Hunk; hunks: Hunk[] }[] = []
  for (const h of rawHunks(oldLines, newLines)) {
    const last = groups.at(-1)
    if (last && h.oldStart - (last.tail.oldStart + last.tail.oldCount) <= 2 * context) {
      last.hunks.push(h)
      last.tail = h
    } else groups.push({ head: h, tail: h, hunks: [h] })
  }
  if (groups.length === 0) return null

  const a = patchPath('a/', rel)
  const b = patchPath('b/', rel)
  let out = `diff --git ${a} ${b}\n--- ${a}\n+++ ${b}\n`
  for (const { head, tail, hunks } of groups) {
    const oldFrom = Math.max(0, head.oldStart - context)
    const oldTo = Math.min(oldLines.length, tail.oldStart + tail.oldCount + context)
    const newFrom = head.newStart - (head.oldStart - oldFrom)
    const newTo = tail.newStart + tail.newCount + (oldTo - (tail.oldStart + tail.oldCount))
    out += `@@ -${range(oldFrom, oldTo - oldFrom)} +${range(newFrom, newTo - newFrom)} @@\n`
    let pos = oldFrom
    for (const h of hunks) {
      for (; pos < h.oldStart; pos++) out += emit(' ', oldLines[pos] ?? '')
      for (let i = 0; i < h.oldCount; i++) out += emit('-', oldLines[h.oldStart + i] ?? '')
      for (let i = 0; i < h.newCount; i++) out += emit('+', newLines[h.newStart + i] ?? '')
      pos = h.oldStart + h.oldCount
    }
    for (; pos < oldTo; pos++) out += emit(' ', oldLines[pos] ?? '')
  }
  return out
}
