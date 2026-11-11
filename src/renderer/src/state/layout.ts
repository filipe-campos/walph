import { initialDockerState } from '../lib/dockerContainers'
import { PANEL_HEIGHT, PANEL_WIDTH, SIDEBAR_WIDTH } from '../lib/session'
import type { LayoutState } from '../types/layout'

export function globalLayoutState(): LayoutState {
  return {
    root: null,
    view: 'explorer',
    screen: 'workbench',
    docker: initialDockerState(),
    sidebarVisible: true,
    sidebarWidth: SIDEBAR_WIDTH.default,
    panelHeight: PANEL_HEIGHT.default,
    panelPosition: 'bottom',
    panelWidth: PANEL_WIDTH.default,
    panelMaximized: false,
    workspaces: null,
    viewActive: true
  }
}
