import type { Eol } from './textFormat'

export type EolChangePlan =
  | { kind: 'ignore' }
  /** Back to the disk EOL: `formatDirty` goes away; the tab only becomes clean if the text is also the saved one. */
  | { kind: 'restore-disk'; clean: boolean; resync: boolean }
  /**
   * EOL different from the disk: `formatDirty` keeps `diskEol`; `announce` = the tab was clean (auto save needs to see
   * it).
   */
  | { kind: 'diverge'; diskEol: Eol; announce: boolean }

/**
 * Decision of the line ending switch from the status bar. `diskEol` = value in `formatDirty` (`undefined` = the tab had
 * not diverged yet); `textSaved` is only called when going back to the disk EOL.
 */
export function planEolChange(input: {
  tabEol: Eol | null
  next: Eol
  diskEol: Eol | undefined
  dirty: boolean
  conflict: boolean
  textSaved: () => boolean
}): EolChangePlan {
  const { tabEol, next, diskEol } = input
  if (tabEol === null || tabEol === next) return { kind: 'ignore' }
  if (diskEol === next) {
    const clean = input.textSaved()
    return { kind: 'restore-disk', clean, resync: clean && input.conflict }
  }
  return { kind: 'diverge', diskEol: diskEol ?? tabEol, announce: !input.dirty }
}
