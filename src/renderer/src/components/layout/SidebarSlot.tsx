import { memo } from 'react'
import { useStore } from '../../store'
import { resizeSidebar } from '../../layoutActions'
import { Explorer } from '../sidebar/Explorer'
import { SearchView } from '../sidebar/SearchView'
import { GitView } from '../sidebar/GitView'
import { OutlineView } from '../sidebar/OutlineView'
import { DebugView } from '../debug/DebugView'
import { Resizer } from '../Resizer'

// No props: dragging the handle only changes the slot width, it does not need to re-render the views.
const ExplorerView = memo(Explorer)
const OutlinePane = memo(OutlineView)
const SearchPane = memo(SearchView)
const GitPane = memo(GitView)
const DebugPane = memo(DebugView)

/** Sidebar and its handle: the width is subscribed here, so dragging re-renders only this slot. */
export function SidebarSlot() {
  const view = useStore((s) => s.view)
  const sidebarVisible = useStore((s) => s.sidebarVisible)
  const sidebarWidth = useStore((s) => s.sidebarWidth)
  return (
    <>
      {/* The explorer stays mounted (scroll and selection; it is virtualized). Search and Git keep their state in the
          store and only exist while visible: when hidden, they do not re-render on every watcher event. */}
      <aside className="sidebar" hidden={!sidebarVisible} style={{ width: sidebarWidth }}>
        <div className="sidebar-slot" hidden={view !== 'explorer'}>
          <ExplorerView />
          <OutlinePane />
        </div>
        <div className="sidebar-slot" hidden={view !== 'search'}>
          {sidebarVisible && view === 'search' && <SearchPane />}
        </div>
        <div className="sidebar-slot" hidden={view !== 'git'}>
          {sidebarVisible && view === 'git' && <GitPane />}
        </div>
        <div className="sidebar-slot" hidden={view !== 'debug'}>
          {sidebarVisible && view === 'debug' && <DebugPane />}
        </div>
      </aside>
      {sidebarVisible && <Resizer axis="x" onDrag={resizeSidebar} />}
    </>
  )
}
