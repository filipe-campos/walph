/** Bottom panel view; only `terminalVisible` (panel open) goes to the session, not the view. */
export type PanelView = 'problems' | 'output' | 'terminal' | 'references' | 'hierarchy' | 'debugConsole'

export interface TerminalInfo {
  id: string
  /** Panel tab: terminals with the same `groupId` show side by side (split). */
  groupId: string
  /** Automatic title (foreground process, comes from main). */
  title: string
  /** Name given by the user (rename); wins over the automatic one. */
  customTitle?: string | undefined
  /** Profile it was created with (the split inherits it). `null` = default. */
  profile: string | null
}

export interface PanelState {
  /** Bottom panel open (the name comes from when it only hosted the terminal; the session stores this value). */
  terminalVisible: boolean
  panelView: PanelView
  terminals: TerminalInfo[]
  activeTerminalId: string | null
  /** Terminal with the search (⌘F) open. */
  terminalFindId: string | null
  /** Terminal whose name is being edited in the tab (rename). */
  renamingTerminalId: string | null
}
