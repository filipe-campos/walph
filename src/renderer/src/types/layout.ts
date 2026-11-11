import type { PanelPosition, SidebarView, WorkspacesState } from '@shared/types'
import type { DockerState } from '../lib/dockerContainers'

export interface LayoutState {
  root: string | null
  view: SidebarView
  /**
   * Screen that takes over the work area (`containers` hides explorer, editor, terminal and Claude, which stay
   * mounted). Renderer only and outside the session: reopening goes back to the normal layout. Change it via
   * `dockerActions.ts`.
   */
  screen: 'workbench' | 'containers'
  /** Docker: containers, stats, detail and logs; actions in `dockerActions.ts`. */
  docker: DockerState
  sidebarVisible: boolean
  /** Sidebar width and panel height (px): they are part of the folder session. */
  sidebarWidth: number
  panelHeight: number
  /** Panel below or to the right of the editor (session) and its width when on the right. */
  panelPosition: PanelPosition
  panelWidth: number
  /** Panel taking the whole main area (transient: does not go to the session). */
  panelMaximized: boolean
  /** WorkspaceBar tabs, coming from main (`null` = not loaded yet). This view is `selfId`. */
  workspaces: WorkspacesState | null
  /** This view is the visible one of the workspace (derived from `workspaces`); hidden, watcher work is deferred. */
  viewActive: boolean
}
