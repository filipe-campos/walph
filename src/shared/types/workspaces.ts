import type { ClaudeAgentStatus, ClaudeConversationId } from './claude'

/** Id of a workspace (a `WorkspaceBar` tab), stable while the app runs; not written to disk. */
export type WorkspaceId = string

/**
 * A `WorkspaceBar` tab. Each workspace is its own `WebContentsView` inside the window, with the whole renderer
 * (explorer, terminals, git, LSP, Claude). Restored and never activated = `dormant` (no view: only name and
 * branch from last time).
 */
export interface WorkspaceInfo {
  id: WorkspaceId
  /** Folder name (basename), or "No folder" for the empty view (Welcome). */
  name: string
  root: string | null
  /** Last branch reported by the view (`reportBranch`) or stored in `windows.json`; `null` = no git/unknown. */
  branch: string | null
  /** The most urgent among the workspace's Claude sessions (`attention` > `error` > `running` > `done` > `idle`). */
  status: ClaudeAgentStatus
  /** Sum of the unread counts of the workspace's sessions. */
  unread: number
  /** It is the visible view of the window. */
  active: boolean
  dormant: boolean
  /**
   * Notifications muted by the user (tab context menu): no OS notification, sound, toast coming from another
   * workspace or count in the Dock badge. Status and unread counts stay on the tab. Persisted in `windows.json`.
   */
  muted: boolean
}

/** Actions of the context menu of a `WorkspaceBar` tab (`workspaces:contextMenu`). */
export type WorkspaceTabAction = 'mute' | 'unmute' | 'copyPath' | 'close'

/** State of a window's `WorkspaceBar`, as each view receives it (`workspaces:changed`). */
export interface WorkspacesState {
  /** The workspace of this view (the receiving renderer). */
  selfId: WorkspaceId
  /** In tab order. */
  workspaces: WorkspaceInfo[]
}

/**
 * Notice from a Claude session of an **inactive** workspace (`notifications:show`), shown as a toast in the window's
 * active view with the card of the source workspace. Texts already translated (`t()`); `sessionTitle` comes from
 * Claude (untrusted: plain text).
 */
export interface WorkspaceNotice {
  /** Same key = replaces the previous one; `notifications:dismiss` removes by key. */
  key: string
  workspace: { id: WorkspaceId; name: string; root: string | null; branch: string | null }
  sessionId: ClaudeConversationId
  signal: 'done' | 'attention' | 'error'
  /** E.g. "Claude Code finished". */
  title: string
  sessionTitle: string
}

/**
 * Workspaces of the window: one `WorkspaceBar` tab per folder, each in its own `WebContentsView`. Every call applies
 * to the window of the calling view. A folder is never in two workspaces (in any window).
 */
export interface WorkspacesApi {
  /** Current state of this window's bar (the same as `onChange`). */
  list(): Promise<WorkspacesState>
  /**
   * Opens a folder as a new workspace and activates it (`workspaces:add`). Without `root`, shows the native dialog. A
   * folder already open (in any window) activates the owning workspace and focuses its window. `false` if cancelled or
   * already open.
   */
  add(root?: string): Promise<boolean>
  /**
   * Opens several folders as workspaces of this window, in order (`workspaces:openMany`); the active empty view
   * (Welcome) is reused for the first. A folder already open in any workspace is skipped; a folder that no longer
   * exists is skipped and leaves the recents. Without `roots` ("Open All"): the last list of workspaces with a folder
   * of this window (or, for a restored window, the one from `windows.json`); without a list, the recents up to 9. The
   * last one opened becomes active. Returns how many it opened.
   */
  openMany(roots?: string[]): Promise<number>
  /**
   * "Start with Claude" (`workspaces:openWithPrompt`): without `root`, shows the native folder dialog (with "New
   * Folder"); opens as in `add` (folder already open = activates the owner) and, when the view is in the folder, sends
   * `claude:startRequested` to it. `false` if the dialog was cancelled.
   */
  openWithPrompt(root: string | null, prompt: string): Promise<boolean>
  /**
   * Makes the workspace the visible view of the window (creates the view if it was dormant), moves focus to it and
   * marks all its Claude sessions as read. With `reveal`, the view shows that session (`claude:event` `reveal`).
   */
  activate(id: WorkspaceId, reveal?: ClaudeConversationId): void
  /**
   * Closes the workspace (`workspaces:close`). With unsaved files it goes through the same guard as the window, only
   * in that view (`window:closeRequested` → Save / Don't Save / Cancel). Closing the last one leaves an empty view
   * with the Welcome (the window does not close). Ends the view's processes (pty, LSP, Claude, watcher).
   */
  close(id: WorkspaceId): Promise<void>
  /** Moves the tab to `index` (0-based, clamped to the list). */
  move(id: WorkspaceId, index: number): void
  /** Mutes (or unmutes) the workspace's notifications (`workspaces:setMuted`). */
  setMuted(id: WorkspaceId, muted: boolean): void
  /**
   * Native context menu of the tab (`workspaces:contextMenu`): Mute/Unmute notifications, Copy path, Close.
   * Resolves with the chosen action (the renderer runs it) or `null` if closed without a choice.
   */
  showContextMenu(id: WorkspaceId): Promise<WorkspaceTabAction | null>
  /** Reports the current branch of this view (only on change; `null` = no repository). Main runs no git for the bar. */
  reportBranch(branch: string | null): void
  /** The bar state changed (tabs, order, active, branch, status or unread) (`workspaces:changed`). */
  onChange(cb: (state: WorkspacesState) => void): () => void
}

/** Notices that main sends to the window's active view about the inactive workspaces. */
export interface NotificationsApi {
  /** `notifications:show`. */
  onShow(cb: (notice: WorkspaceNotice) => void): () => void
  /** The notice no longer applies (request answered, session read, workspace closed) (`notifications:dismiss`). */
  onDismiss(cb: (key: string) => void): () => void
  /**
   * A conversation notice appeared in this view: main decides whether to play (setting and minimum interval between
   * plays, so two simultaneous notices do not add up) and, if so, sends `notifications:playSound` back.
   */
  requestSound(): void
  /** `notifications:playSound`: play the notice sound now. */
  onPlaySound(cb: () => void): () => void
}
