// Editor gutter marks: per-line difference between the index content (baseline) and the current document.
// Pure and without CodeMirror: takes and returns lines (the editor document always uses `\n`).
import { diffLines } from '@shared/lineDiff'

export type GutterKind = 'added' | 'modified' | 'deleted'

export interface GutterMark {
  /** Line of the current document (from 1). */
  line: number
  kind: GutterKind
}

/** Above this the gutter is not computed (giant files, usually generated). */
export const MAX_GUTTER_LINES = 50_000

/**
 * Marks per line of the current document:
 * - only new lines → `added`;
 * - replaced lines → `modified` (whatever is left of new lines beyond the old ones is `added`);
 * - only removed lines → `deleted` on the line after the removed block (the last one, if the removal was at the end).
 * `base === null` (file outside the index) has no marks.
 */
export function gutterMarks(base: string[] | null, doc: string[]): GutterMark[] {
  if (!base || base.length > MAX_GUTTER_LINES || doc.length > MAX_GUTTER_LINES) return []
  const marks = new Map<number, GutterKind>()
  for (const hunk of diffLines(base, doc)) {
    if (hunk.newCount === 0) {
      const line = Math.min(hunk.newStart + 1, doc.length)
      if (line >= 1 && !marks.has(line)) marks.set(line, 'deleted')
      continue
    }
    const modified = Math.min(hunk.oldCount, hunk.newCount)
    for (let i = 0; i < hunk.newCount; i++) marks.set(hunk.newStart + i + 1, i < modified ? 'modified' : 'added')
  }
  return [...marks].map(([line, kind]) => ({ line, kind })).sort((a, b) => a.line - b.line)
}
