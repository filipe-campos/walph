import type { FileTab } from '../types/tabs'

/** Complete, clean file tab; `patch` overrides the fields the test wants to control. */
export function fileTab(patch: Partial<FileTab> = {}): FileTab {
  return {
    id: 't1',
    kind: 'file',
    path: '/r/a.ts',
    dirty: false,
    preview: false,
    deleted: false,
    conflict: false,
    eol: 'LF',
    indent: null,
    indentFallback: false,
    encoding: null,
    encodingChosen: false,
    language: null,
    ...patch
  }
}
