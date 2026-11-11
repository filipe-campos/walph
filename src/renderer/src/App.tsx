import { lazy, Suspense, useEffect } from 'react'
import { useStore } from './store'
import { QuickInput } from './components/quickInput/QuickInput'
import { ActivityBar } from './components/ActivityBar'
import { EditorArea } from './components/editor/EditorArea'
import { StatusBar } from './components/StatusBar'
import { Toasts } from './components/Toasts'
import { useFocusRegion } from './components/common/useFocusRegion'
import { WorkspaceBar } from './components/WorkspaceBar'
import { SidebarSlot } from './components/layout/SidebarSlot'
import { PanelSlot } from './components/layout/PanelSlot'
import { ClaudeSlot } from './components/layout/ClaudeSlot'
import { OverlayHost } from './components/layout/OverlayHost'
import { DebugToolbar } from './components/debug/DebugToolbar'

// Heavy, rarely used screen loads on demand (outside the initial bundle). The fallback is empty: the layout already
// reserves its area, so nothing jumps when it arrives.
const ContainersView = lazy(() =>
  import('./components/containers/ContainersView').then((m) => ({ default: m.ContainersView }))
)

export function App() {
  const editorSlotRef = useFocusRegion<HTMLDivElement>('editorSlot')
  const takeover = useStore((s) => s.screen === 'containers')
  const viewActive = useStore((s) => s.viewActive)
  // When hidden, the view pauses continuous animations (CSS keyed on this attribute).
  useEffect(() => {
    const root = document.documentElement
    if (viewActive) delete root.dataset.viewInactive
    else root.dataset.viewInactive = ''
    return () => {
      delete root.dataset.viewInactive
    }
  }, [viewActive])
  const panelRight = useStore((s) => s.panelPosition === 'right')
  // Maximized only applies with the panel open; the editor stays mounted (hidden).
  const maximized = useStore((s) => s.panelMaximized && s.terminalVisible)

  useEffect(() => {
    // Dropping an OS file outside a proper target would navigate the window to it. Files only: dragging text into
    // an input still works.
    const block = (e: DragEvent): void => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    window.addEventListener('dragover', block)
    window.addEventListener('drop', block)
    return () => {
      window.removeEventListener('dragover', block)
      window.removeEventListener('drop', block)
    }
  }, [])

  return (
    <div className="app">
      <WorkspaceBar />
      {/* Containers takes over the screen: the rest stays mounted (hidden by CSS) to keep editor, terminal, chats. */}
      <div className={`workbench${takeover ? ' takeover' : ''}`}>
        <ActivityBar />
        <SidebarSlot />
        <main className={`main${panelRight ? ' panel-right' : ''}`}>
          <div ref={editorSlotRef} className="editor-slot" hidden={maximized}>
            <EditorArea />
          </div>
          <PanelSlot />
          <DebugToolbar />
          <Toasts />
        </main>
        <ClaudeSlot />
        {takeover && (
          <Suspense fallback={null}>
            <ContainersView />
          </Suspense>
        )}
      </div>
      <StatusBar />
      <QuickInput />
      <OverlayHost />
    </div>
  )
}
