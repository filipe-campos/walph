import type { GitCommitFile, TextEncoding } from '@shared/types'
import type { LayoutNode } from '@shared/editorLayout'
import type { ClosedTab } from '../lib/closedTabs'
import type { EditorGroup } from '../lib/editorGroups'
import type { Eol, Indent } from '../lib/textFormat'

export interface FileTab {
  id: string
  kind: 'file'
  path: string
  dirty: boolean
  /** Preview tab (italic): it is replaced by the next preview; editing or a double click pins it. */
  preview: boolean
  /** The file was removed from disk externally; saving recreates it. */
  deleted: boolean
  /** The file changed on disk while the tab had unsaved changes. */
  conflict: boolean
  /** Detected when the file is loaded in the editor (`null` before that). */
  eol: Eol | null
  indent: Indent | null
  /** The indentation came from `editor.tabSize`/`insertSpaces` (file with no detectable indentation): follows the
   * settings.
   */
  indentFallback: boolean
  /** File encoding (`null` before it is read). Detected by the BOM, or the one chosen by the user. */
  encoding: TextEncoding | null
  /** The user chose the encoding: later reads force it and the session stores it. */
  encodingChosen: boolean
  /** Language mode chosen by the user (language-data `name` or "Texto"); `null` = by extension. */
  language: string | null
}

export interface DiffTab {
  id: string
  kind: 'diff'
  path: string
  /** true: HEAD ↔ index; false: index ↔ working tree */
  staged: boolean
  /** Diff of a file from a commit (read-only, first parent ↔ commit); does not go to the session. */
  commit?: { hash: string; file: GitCommitFile }
  /**
   * Edit proposed by Claude (Accept / Reject in the header): ephemeral, does not go to the session. The content lives
   * in the conversation permission request (`claude`), so the tab only stores the key.
   */
  proposal?: { conversationId: string; requestId: string }
  /**
   * Comparison of any two files, outside git (`path` is the right side). Ephemeral, does not go to the session. Each
   * side shows the buffer of the file's open tab (the disk if there is no tab) or, with `saved`, always the disk.
   */
  compare?: { left: CompareSide; right: CompareSide }
  /** "Compare Changes" of a conflicted file: current version (ours) ↔ incoming (theirs); does not go to the session. */
  mergeCompare?: true
}

export interface CompareSide {
  path: string
  saved?: boolean
}

/** Markdown preview of a file: renders the buffer of the file's tab, with no content of its own. */
export interface MarkdownPreviewTab {
  id: string
  kind: 'markdownPreview'
  /** Path of the source `.md`/`.mdx`. */
  path: string
}

/** Image opened in the viewer (read-only, without an editor document). */
export interface ImageTab {
  id: string
  kind: 'image'
  path: string
}

export type Tab = FileTab | DiffTab | MarkdownPreviewTab | ImageTab

export interface Reveal {
  tabId: string
  line: number
  column: number
  length: number
}

export interface TabsState {
  /** The tabs (entities: document, dirty, LSP); which ones show in each group is in `editorGroups`. */
  tabs: Tab[]
  /** The groups (1 to `MAX_EDITOR_GROUPS`) in grid order, each with its own tab strip and active tab. */
  editorGroups: EditorGroup[]
  activeGroupId: string
  /** Grid of group splits (leaves = `editorGroups` ids); written only by `commitGroups`. */
  editorLayout: LayoutNode<string>
  /** Mirror of the active tab of the active group: kept by every action changing groups/tabs (see `commitGroups`). */
  activeTabId: string | null
  reveal: Reveal | null
  /** `selected` = selected characters summing all selections (0 without a selection). */
  cursor: { line: number; column: number; selected: number } | null
  /** Revision per path of the tabs that reread the disk (working tree diff, image, Markdown preview): bumps when the
   * watcher touches the file.
   */
  fileRevs: Record<string, number>
  /** File marked by "Select for Compare" (the left side of the next "Compare with Selected"). */
  compareSelection: string | null
  /** "Reopen Closed Tab" stack for this folder (the top is the end of the list). */
  closedTabs: ClosedTab[]
  /** "Save / Don't Save / Cancel" dialog open: auto save stays suspended (it must not write what the user will
   * discard).
   */
  confirmingSave: boolean
}
