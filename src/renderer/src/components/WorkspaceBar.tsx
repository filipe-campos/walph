import { useEffect, useMemo, useRef, useState } from 'react'
import { WORKSPACE_SELECT_IDS } from '@shared/commands'
import type { WorkspaceInfo } from '@shared/types'
import { useStore } from '../store'
import { activateWorkspace, closeWorkspace, moveWorkspace, showWorkspaceMenu } from '../workspaceActions'
import { useShortcutLabel } from './common/useShortcutLabel'
import { isViewActive, parentFolderName, unreadAria, unreadLabel } from '../lib/workspaces'
import { Icon } from './common/Icon'
import { StatusDot } from './common/StatusDot'
import { useReorderDrag } from './common/useReorderDrag'
import { useRovingFocus } from './common/useRovingFocus'
import { openAddWorkspace } from '../overlayActions'
import { useT } from '../i18n'
import { IconButton } from './common/IconButton'

const DRAG_TYPE = 'application/x-walph-workspace'

/** Shortcut in the `aria-keyshortcuts` format (Meta/Control instead of CmdOrCtrl). */
function ariaShortcut(accelerator: string, platform: string): string {
  return accelerator
    .replace('CmdOrCtrl', platform === 'darwin' ? 'Meta' : 'Control')
    .replace('Cmd', 'Meta')
    .replace('Ctrl', 'Control')
}

const isBusy = (w: WorkspaceInfo): boolean => w.status === 'running' || w.status === 'attention'

function WorkspaceTab({
  ws,
  index,
  dragStyle,
  dragging,
  entering,
  onEntered,
  onActivate,
  viewActive,
  onDragStart,
  onDragEnd,
  closable
}: {
  ws: WorkspaceInfo
  index: number
  dragStyle: React.CSSProperties | undefined
  dragging: boolean
  entering: boolean
  onEntered: (id: string) => void
  onActivate: (id: string) => void
  viewActive: boolean
  onDragStart: (e: React.DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  closable: boolean
}) {
  const t = useT()
  const m = t.app.workspaceBar
  // ⌘1…⌘9 only for the first nine; the label is the effective shortcut (keybindings.json), never the default.
  const selectId = WORKSPACE_SELECT_IDS.at(index)
  const shortcut = useShortcutLabel(selectId)
  const keyShortcuts = useStore((s) => {
    const accelerator = selectId ? s.keybindings?.[selectId]?.[0] : undefined
    return accelerator ? ariaShortcut(accelerator, window.api.platform) : undefined
  })
  const { name, branch, status, unread, active, dormant, muted } = ws
  const parent = parentFolderName(ws.root)
  const running = status === 'running'

  // Ping when the unread count increases: the counter remounts (key) and the animation runs again. Adjusted during
  // render
  // (the React pattern for state derived from a prop), without an effect. Only counts with the view active: in a hidden
  // view the animation would be paused and play in full on reveal.
  const [seen, setSeen] = useState(unread)
  const [pings, setPings] = useState(0)
  if (unread !== seen) {
    setSeen(unread)
    if (unread > seen && viewActive) setPings((n) => n + 1)
  }

  const unreadText = unreadAria(unread)
  const label = [
    name,
    branch && m.branchAria(branch),
    !dormant && status !== 'idle' && m.status[status],
    !dormant && unread > 0 && unreadText,
    muted && m.muted
  ]
    .filter(Boolean)
    .join(', ')
  const title = (ws.root ? `${ws.root}${branch ? ` · ${branch}` : ''}` : name) + (muted ? ` · ${m.muted}` : '')
  return (
    <div
      role="tab"
      aria-selected={active}
      aria-label={label}
      aria-keyshortcuts={keyShortcuts}
      tabIndex={active ? 0 : -1}
      draggable
      title={title}
      data-workspace-id={ws.id}
      data-status={dormant ? 'dormant' : status}
      className={[
        'workspace-tab',
        entering && !running && status !== 'attention' && 'entering',
        active && 'active',
        running && 'running',
        !dormant && status === 'attention' && 'attention',
        dormant && 'dormant',
        muted && 'muted',
        dragging && 'dragging'
      ]
        .filter(Boolean)
        .join(' ')}
      style={dragStyle}
      onContextMenu={(e) => {
        e.preventDefault()
        void showWorkspaceMenu(ws)
      }}
      onClick={() => !active && onActivate(ws.id)}
      onAuxClick={(e) => e.button === 1 && void closeWorkspace(ws.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onActivate(ws.id)
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && closable) {
          e.preventDefault()
          void closeWorkspace(ws.id)
        }
      }}
      onAnimationEnd={(e) => {
        if (entering && e.target === e.currentTarget && e.animationName === 'workspace-tab-in') onEntered(ws.id)
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {!dormant && <StatusDot status={status} />}
      <span className="workspace-tab-text">
        <span className="workspace-tab-name">{name}</span>
        {branch && (
          <span className="workspace-tab-branch" title={branch}>
            <Icon name="branch" />
            <span className="workspace-tab-branch-label">{branch}</span>
          </span>
        )}
        {parent && (
          <span className="workspace-tab-parent" title={parent}>
            {parent}
          </span>
        )}
      </span>
      {muted && <i className="codicon codicon-bell-slash workspace-tab-muted" aria-hidden />}
      {!dormant && unread > 0 && (
        <span
          key={pings}
          className={['unread-badge workspace-tab-unread', pings > 0 && 'pop'].filter(Boolean).join(' ')}
          data-count-status={status}
          role="img"
          aria-label={unreadText}
          title={unreadText}
        >
          {unreadLabel(unread)}
        </span>
      )}
      {shortcut && (
        <kbd className="workspace-tab-kbd" aria-hidden>
          {shortcut.startsWith('⌘') ? (
            <>
              <Icon name="command" className="workspace-tab-kbd-mod" />
              <span className="workspace-tab-kbd-key">{shortcut.slice(1)}</span>
            </>
          ) : (
            shortcut
          )}
        </kbd>
      )}
      {closable && (
        // Out of the Tab order and of the tab name: the keyboard closes with Delete/Backspace.
        <button
          className="tab-close workspace-tab-close"
          tabIndex={-1}
          aria-hidden
          title={t.app.closeWorkspace}
          draggable={false}
          onClick={(e) => {
            e.stopPropagation()
            void closeWorkspace(ws.id)
          }}
        >
          <Icon name="close" />
        </button>
      )}
    </div>
  )
}

/**
 * Workspace bar at the top of the window and also the title bar: the background drags the window, tabs and buttons
 * do not. The state comes from main (`workspaces:changed`); each view renders its own with the same content.
 */
export function WorkspaceBar() {
  const t = useT()
  const list = useStore((s) => s.workspaces?.workspaces)
  const addShortcut = useShortcutLabel('workspace.add')
  const scroller = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  const viewActive = useStore((s) => isViewActive(s.workspaces))
  const serverActiveId = list?.find((w) => w.active)?.id

  // Optimistic switch: the clicked tab becomes active right away, without waiting for main to return the state. Only
  // holds while main's active one does not change; adjusted during render, like the tabs' `seen`.
  const [optimistic, setOptimistic] = useState<{ id: string; base: string | undefined } | null>(null)
  if (optimistic && optimistic.base !== serverActiveId) setOptimistic(null)
  const activeId = optimistic?.id ?? serverActiveId
  const shown = useMemo(() => list?.map((w) => ({ ...w, active: w.id === activeId })), [list, activeId])

  // Only a tab that appears after the first paint, with the view active, animates in; the others (including those
  // created while the view was hidden) are born known.
  const [known, setKnown] = useState<ReadonlySet<string> | null>(null)
  // A tab created already running/waiting does not play the entrance (the status animation replaces it): also born
  // known.
  const unknown = known && list?.filter((w) => !known.has(w.id))
  if (list && (known === null || (unknown && unknown.length > 0 && (!viewActive || unknown.some(isBusy))))) {
    setKnown(new Set(list.map((w) => w.id)))
  }
  const onEntered = (id: string): void => setKnown((k) => (k ? new Set(k).add(id) : k))
  const onActivate = (id: string): void => {
    setOptimistic({ id, base: serverActiveId })
    activateWorkspace(id)
  }

  // The active tab always in view when the bar scrolls.
  useEffect(() => {
    if (!activeId) return
    const el = scroller.current?.querySelector<HTMLElement>(`[data-workspace-id="${CSS.escape(activeId)}"]`)
    el?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [activeId])

  const onTabsKeyDown = useRovingFocus()
  const ids = useMemo(() => list?.map((w) => w.id) ?? [], [list])
  const reorder = useReorderDrag({ containerRef: tabsRef, type: DRAG_TYPE, axis: 'x', ids, onMove: moveWorkspace })

  return (
    <div className="workspace-bar">
      <div
        ref={scroller}
        className="workspace-scroller"
        onWheel={(e) => {
          // A vertical mouse wheel scrolls the bar horizontally.
          const el = scroller.current
          if (el && e.deltaY !== 0 && e.deltaX === 0) el.scrollLeft += e.deltaY
        }}
        {...reorder.dropProps}
        onKeyDown={onTabsKeyDown}
      >
        <div
          ref={tabsRef}
          className={['workspace-tabs', reorder.dragging && 'dragging', reorder.settling && 'settling']
            .filter(Boolean)
            .join(' ')}
          role="tablist"
          aria-label={t.app.workspaceBar.tablist}
        >
          {shown?.map((ws, i) => (
            <WorkspaceTab
              key={ws.id}
              ws={ws}
              entering={viewActive && known !== null && !known.has(ws.id)}
              onEntered={onEntered}
              onActivate={onActivate}
              viewActive={viewActive}
              index={i}
              dragStyle={reorder.itemStyle(i)}
              dragging={reorder.draggingId === ws.id}
              closable={shown.length > 1 || !!ws.root}
              {...reorder.itemProps(ws.id, i)}
            />
          ))}
        </div>
        <IconButton
          className="workspace-add"
          label={t.app.openFolderAsWorkspace}
          shortcut={addShortcut}
          onClick={openAddWorkspace}
          glyph="plus"
        />
      </div>
    </div>
  )
}
