import type { SnippetSnapshot } from '@shared/types'

export interface SnippetsState {
  /** Snippets of the user and of the folder `.vscode/`, as main delivered them (a folder switch arrives as a new
   * snapshot).
   */
  snippets: SnippetSnapshot
}
