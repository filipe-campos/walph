import type { ClaudePermissionMode } from '../settings'
import type { PanelPosition, SidebarView } from './window'
import type { TextEncoding } from './fs'
import type { ClaudeEffort } from './claude'
import type { LayoutNode } from '../editorLayout'

/** Position in the document: line from 1, column (offset in the line) from 0, the same convention as `Reveal`. */
export interface SessionPosition {
  line: number
  column: number
}

export interface SessionFileTab {
  kind: 'file'
  /** Absolute path. */
  path: string
  preview: boolean
  /**
   * Encoding chosen by the user ("Reopen/Save with encoding"); absent = detect by the BOM. Restoring reads with
   * it.
   */
  encoding?: TextEncoding
  /** Language mode chosen by the user (`name` from `@codemirror/language-data`); absent = by the extension. */
  language?: string
  /** Head of the main selection. */
  cursor: SessionPosition
  /**
   * First line visible at the top of the editor (from 1). A line and not pixels: the height of lines not measured yet
   * is estimated by CodeMirror, so a `scrollTop` in px lands somewhere else after measurement.
   */
  topLine: number
}

export interface SessionDiffTab {
  kind: 'diff'
  /** Absolute path. */
  path: string
  staged: boolean
}

/** Markdown preview of a file (renders the buffer of the file's tab, never stores content). */
export interface SessionMarkdownPreviewTab {
  kind: 'markdownPreview'
  /** Absolute path of the source `.md`/`.mdx`. */
  path: string
}

/** Image viewer (reads the file on reopen, never stores content). */
export interface SessionImageTab {
  kind: 'image'
  /** Absolute path of the image. */
  path: string
}

export type SessionTab = SessionFileTab | SessionDiffTab | SessionMarkdownPreviewTab | SessionImageTab

/** An editor group (at most `MAX_EDITOR_GROUPS`, laid out by `WorkspaceSession.editorLayout`). */
export interface SessionEditorGroup {
  /** Indices into `WorkspaceSession.tabs`, in the group's strip order. The same tab can be in several groups. */
  tabs: number[]
  /** Index into `WorkspaceSession.tabs` of the group's active tab (`null` = none); must be in `tabs`. */
  activeIndex: number | null
}

/** A closed tab that "Reopen Closed Tab" can still bring back. */
export interface SessionClosedTab {
  tab: SessionTab
  /** Index into `WorkspaceSession.editorGroups` of the group it left; `null` = the group no longer exists. */
  group: number | null
  /** Position in the group's tab strip. */
  index: number
}

/** A Claude panel conversation tab stored in the workspace session; reopened on demand (resuming the CLI). */
export interface SessionClaudeTab {
  /** CLI UUID. Absent = conversation that has had no message yet (only the draft survives; reopens as new). */
  sessionId?: string
  title?: string
  model?: string
  permissionMode?: ClaudePermissionMode
  effort?: ClaudeEffort
  /** Unsent text of the prompt box (attachments are not stored). */
  draft?: string
}

/** Breakpoints of a file stored in the session (the same fields `debug.setBreakpoints` receives). */
export interface SessionBreakpointFile {
  /** Absolute path. */
  path: string
  breakpoints: SessionBreakpoint[]
}

export interface SessionBreakpoint {
  /** Line from 1. */
  line: number
  /** `false` = disabled (stays in the list, not sent to the adapter). Absent = enabled. */
  enabled?: boolean
  condition?: string
  hitCondition?: string
  logMessage?: string
}

/**
 * State of a folder, saved by main in `<userData>/sessions/<path-hash>.json` and restored when it is reopened. Only
 * the shape is validated in main (invalid input is dropped, the rest kept); the renderer ignores tabs whose file is
 * gone.
 */
export interface WorkspaceSession {
  /** In tab order. */
  tabs: SessionTab[]
  /** Index of the active tab in `tabs` (`null` = none). */
  activeIndex: number | null
  /** Folders expanded in the explorer (absolute paths; includes the root if it is open). */
  expanded: string[]
  view: SidebarView
  sidebarVisible: boolean
  /** Sidebar width, in pixels. */
  sidebarWidth: number
  terminalVisible: boolean
  /** Terminal panel height, in pixels. */
  panelHeight: number
  /** Where the bottom panel sits (Problems/Output/References/Terminal). Absent/invalid = `bottom`. */
  panelPosition: PanelPosition
  /** Panel width when `panelPosition` is `right`, in pixels. */
  panelWidth: number
  /** Secondary sidebar (Claude panel) visible. Absent = `false`. */
  claudeVisible?: boolean
  /** Secondary sidebar width, in pixels. Absent/invalid = renderer default. */
  claudeWidth?: number
  /**
   * Editor groups (1 to `MAX_EDITOR_GROUPS`). Absent/invalid = a single group with all tabs, active = `activeIndex`.
   * With groups, `activeIndex` is still the active tab of the active group (old sessions and main need not know).
   */
  editorGroups?: SessionEditorGroup[]
  /** Index of the active group in `editorGroups`. Absent/invalid = 0. */
  activeGroup?: number
  /** Grid of the groups: leaves are indices into `editorGroups`. Absent/invalid = the groups side by side. */
  editorLayout?: LayoutNode<number>
  /**
   * Sessions saved before the grid (two groups side by side): fraction of the width of the 1st group (0.15–0.85). Only
   * read when there is no `editorLayout`.
   */
  editorSplitRatio?: number
  /** Claude conversation tabs, in bar order; absent (old sessions) = none to restore. */
  claudeTabs?: SessionClaudeTab[]
  /** Index into `claudeTabs` of the active tab. */
  claudeActive?: number
  /** Closed tabs for "Reopen Closed Tab", from oldest to newest (at most 20). */
  closedTabs?: SessionClosedTab[]
  /** Breakpoints per file; absent = none. */
  breakpoints?: SessionBreakpointFile[]
  /** Expressions of the debugger's Watch section, in order. */
  watches?: string[]
}

export interface SessionApi {
  /** Saved session of `root` (`session:load`), or `null` if there is none (or the file is unreadable). */
  load(root: string): Promise<WorkspaceSession | null>
  /**
   * Writes the session of `root` (`session:save`), with no reply. Ignored if `root` is not this window's folder. The
   * renderer calls it debounced on every change and immediately before switching folders and on page unload; main
   * ensures that whatever arrived before the app quits is on disk.
   */
  save(root: string, session: WorkspaceSession): void
}
