import type { ContextKey, WindowAction } from '../commands'

export type ExplorerAction =
  | 'newFile'
  | 'newFolder'
  | 'rename'
  | 'delete'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'duplicate'
  | 'copyPath'
  | 'copyRelativePath'
  | 'reveal'
  | 'selectForCompare'
  | 'compareWithSelected'

/** Choice of the native unsaved files dialog. */
export type UnsavedChoice = 'save' | 'dontSave' | 'cancel'

/** Actions of a tab's context menu. `reveal` reveals in Walph's explorer (not in Finder/Explorer). */
export type TabAction =
  | 'close'
  | 'closeOthers'
  | 'closeRight'
  | 'closeSaved'
  | 'copyPath'
  | 'reveal'
  | 'selectForCompare'
  | 'compareWithSelected'

export interface TabMenuOptions {
  /** There are other tabs besides this one (enables "Close Others"). */
  hasOthers: boolean
  /** There are tabs to the right of this one (enables "Close to the Right"). */
  hasRight: boolean
  /** There is some tab without unsaved changes (enables "Close Saved"). */
  hasSaved: boolean
  /** The tab is a file's (shows the compare items). */
  isFile: boolean
  /** There is another file selected to compare (enables "Compare with Selected"). */
  canCompare: boolean
}

/** Generic native confirmation dialog. */
export interface ConfirmOptions {
  message: string
  detail?: string | undefined
  /** Label of the confirm button (e.g. "Discard"). The other button is always "Cancel" (default/Esc). */
  confirmLabel: string
  /** Destructive action: warning icon. */
  destructive?: boolean
}

/** Sidebar view. */
export type SidebarView = 'explorer' | 'search' | 'git' | 'debug'

export type PanelPosition = 'bottom' | 'right'

export interface WindowApi {
  /** Runs a native action of the focused window (`window:action`), the same as the menu `role`s. */
  run(action: WindowAction): void
  /**
   * Reports to main a shortcut context key (`window:setContext`), evaluated in the `when` clauses (e.g. focus is
   * in the terminal). Only sends on change.
   */
  setContext(key: ContextKey, value: boolean): void
  /**
   * Reports whether the window has unsaved files (`window:setDirty`). With `true`, closing the window or quitting the
   * app is intercepted by main and becomes `onCloseRequested`; on macOS it also marks the close button
   * (documentEdited).
   */
  setDirty(dirty: boolean): void
  /**
   * The user asked to close the window (or quit the app) with unsaved files (`window:closeRequested`). The
   * renderer asks, saves whatever is needed and calls `confirmClose()`; if cancelled (or saving fails), it calls
   * `cancelClose()`.
   */
  onCloseRequested(cb: () => void): () => void
  /**
   * A chained app quit was cancelled in another window (`window:closeAborted`): this one had already confirmed
   * ("Don't Save"/"Save") and blocks closing again; the renderer resumes the auto save suspended by the confirmation.
   */
  onCloseAborted(cb: () => void): () => void
  /** Proceeds with the close (or app quit) requested in `onCloseRequested` (`window:confirmClose`). */
  confirmClose(): void
  /** Gives up the close requested in `onCloseRequested` (`window:cancelClose`): main forgets the pending request. */
  cancelClose(): void
  /**
   * Opens `url` in the default browser (or e-mail client) (`window:openExternal`, no reply). Only `http:`, `https:`
   * and `mailto:`; anything else is silently ignored (validate first if the user must be told).
   */
  openExternal(url: string): void
}

export interface DialogApi {
  /**
   * Modal native dialog "Save / Don't Save / Cancel" about unsaved files (`dialog:confirmUnsaved`).
   * `fileNames` are the names (basename) of the dirty files involved; Esc/closing the dialog = `cancel`.
   */
  confirmUnsaved(fileNames: string[]): Promise<UnsavedChoice>
  /** Modal native Confirm/Cancel dialog (`dialog:confirm`); `true` only if confirmed. */
  confirm(options: ConfirmOptions): Promise<boolean>
}

export interface TabsApi {
  /** Native context menu of a tab (`tabs:contextMenu`); `null` if closed without a choice. */
  showContextMenu(options: TabMenuOptions): Promise<TabAction | null>
}
