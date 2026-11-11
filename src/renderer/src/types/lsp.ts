import type { Diagnostic, LspServerStatus } from '@shared/types'
import type { HierarchyState } from '../lib/hierarchyTree'
import type { ReferenceItem } from '../lib/lspReferences'

/** Result of "Go to References" (or of a definition with several targets), shown in the References view. */
export interface ReferencesResult {
  title: string
  items: ReferenceItem[]
}

export interface LspState {
  /** LSP diagnostics by absolute path; a file without problems has no key. Empty on folder switch. */
  diagnostics: Record<string, Diagnostic[]>
  /** The window's language servers (the ones already started), as main reports them. */
  lspStatuses: LspServerStatus[]
  /** Last references list; the References tab of the panel only exists while there is one. */
  references: ReferencesResult | null
  /** Last call/type hierarchy; the Hierarchy tab of the panel only exists while there is one. */
  hierarchy: HierarchyState | null
}
