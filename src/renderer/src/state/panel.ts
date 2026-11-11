import type { PanelState } from '../types/panel'

type ScopedKey = 'panelView'

/** References and Hierarchy go away with the result on folder switch; the other views survive. */
export function scopedPanelState(prev?: Pick<PanelState, 'panelView'>): Pick<PanelState, ScopedKey> {
  const view = prev?.panelView
  return { panelView: view === 'references' || view === 'hierarchy' ? 'problems' : (view ?? 'terminal') }
}

export function globalPanelState(): Omit<PanelState, ScopedKey> {
  return {
    terminalVisible: false,
    terminals: [],
    activeTerminalId: null,
    terminalFindId: null,
    renamingTerminalId: null
  }
}
