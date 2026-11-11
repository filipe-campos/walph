import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { formatNumber } from '@shared/i18n'
import { useStore } from '../store'
import type { PanelView } from '../types/panel'
import { displayTitle, groupIds, groupLabel, membersOf } from '../lib/terminalGroups'
import { countListed } from '../lib/problems'
import { onTerminalEnter } from '../lib/terminalBus'
import { splitPathParts, tildePath } from '../lib/tildePath'
import { DropdownMenu } from './common/DropdownMenu'
import type { MenuEntry } from './common/MenuList'
import { Icon } from './common/Icon'
import { InlineEdit } from './common/InlineEdit'
import { IconButton } from './common/IconButton'
import { useFocusRegion } from './common/useFocusRegion'
import { useRovingFocus } from './common/useRovingFocus'
import { OutputPanel } from './OutputPanel'
import { ProblemsPanel } from './ProblemsPanel'
import { ReferencesPanel } from './ReferencesPanel'
import { HierarchyPanel } from './HierarchyPanel'
import { TerminalPanel } from './TerminalPanel'
import { DebugConsole } from './debug/DebugConsole'
import { clearDebugConsole } from '../debugActions'
import {
  activateTerminalGroup,
  cancelRenameTerminal,
  createTerminal,
  fetchCwd,
  hidePanel,
  killTerminal,
  openTerminalProfilePicker,
  renameTerminal,
  showPanel,
  splitTerminal,
  startRenameTerminal,
  togglePanelMaximized,
  togglePanelPosition
} from '../terminalActions'
import { clearReferences } from '../lspActions'
import { clearHierarchy } from '../hierarchyActions'
import { useT } from '../i18n'

const { platform, homeDir } = window.api

const VIEWS: PanelView[] = ['problems', 'output', 'references', 'hierarchy', 'debugConsole', 'terminal']

const PANES: Record<PanelView, () => React.JSX.Element> = {
  problems: ProblemsPanel,
  output: OutputPanel,
  references: ReferencesPanel,
  hierarchy: HierarchyPanel,
  debugConsole: DebugConsole,
  terminal: TerminalPanel
}

const tabId = (view: PanelView): string => `panel-tab-${view}`
const paneId = (view: PanelView): string => `panel-pane-${view}`

function PanelTab({ view }: { view: PanelView }) {
  const t = useT()
  const active = useStore((s) => s.panelView === view)
  const count = useStore((s) =>
    view === 'problems' ? countListed(s.diagnostics) : view === 'references' ? (s.references?.items.length ?? 0) : 0
  )
  // References and Hierarchy only have a tab while there is a result.
  const exists = useStore(
    (s) => (view !== 'references' || s.references !== null) && (view !== 'hierarchy' || s.hierarchy !== null)
  )
  const tabRef = useFocusRegion<HTMLButtonElement>(active ? 'panelTab' : null)
  if (!exists) return null
  return (
    <button
      ref={tabRef}
      id={tabId(view)}
      className={`panel-tab ${active ? 'active' : ''}`}
      role="tab"
      aria-selected={active}
      aria-controls={paneId(view)}
      tabIndex={active ? 0 : -1}
      onClick={() => showPanel(view)}
    >
      <span className="panel-tab-label">{t.app.panel[view]}</span>
      {count > 0 && <span className="count-badge">{count}</span>}
    </button>
  )
}

/**
 * Name of the terminal being edited (double click on the tab or "Rename Terminal"): Enter applies, Esc cancels, empty
 * restores.
 */
function RenameInput({ id }: { id: string }) {
  const t = useT()
  const initial = useStore((s) => {
    const terminal = s.terminals.find((x) => x.id === id)
    return terminal ? displayTitle(terminal) : ''
  })
  return (
    <InlineEdit
      className="terminal-rename-input"
      aria-label={t.app.panel.terminalName}
      initial={initial}
      spellCheck={false}
      stopClicks
      // Enter returns focus to the terminal; on blur the focus already went where the user clicked.
      onCommit={(text, via) => renameTerminal(id, text, { refocus: via === 'enter' })}
      onCancel={cancelRenameTerminal}
    />
  )
}

/** One tab per terminal group; a split group shows the titles of all its panes. */
function TerminalGroupTab({ groupId }: { groupId: string }) {
  const t = useT()
  // Primitives: only this tab re-renders when its title changes.
  const label = useStore((s) => groupLabel(s.terminals, groupId))
  const count = useStore((s) => membersOf(s.terminals, groupId).length)
  const active = useStore((s) => membersOf(s.terminals, groupId).some((x) => x.id === s.activeTerminalId))
  // Renaming touches the focused pane of the group (or the first one, if the group is not the active one).
  const targetId = useStore((s) => {
    const members = membersOf(s.terminals, groupId)
    return (members.find((x) => x.id === s.activeTerminalId) ?? members[0])?.id
  })
  const renamingId = useStore((s) =>
    membersOf(s.terminals, groupId).some((x) => x.id === s.renamingTerminalId) ? s.renamingTerminalId : null
  )
  const renaming = renamingId !== null
  const ref = useRef<HTMLButtonElement>(null)
  // The active tab never shrinks and scrolls into view (the tab strip scrolls horizontally).
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active])
  const icon = <Icon name={count > 1 ? 'split' : 'terminal'} />
  // The field cannot live inside a <button> (space and clicks would belong to the tab).
  if (renaming)
    return (
      <div className="term-tab term-tab-active">
        {icon} <RenameInput id={renamingId} />
      </div>
    )
  return (
    <button
      ref={ref}
      className={`term-tab${active ? ' term-tab-active' : ''}`}
      role="tab"
      aria-selected={active}
      aria-controls={paneId('terminal')}
      tabIndex={active ? 0 : -1}
      // Inactive tabs shrink to just the icon in narrow panels: the name stays in the tooltip.
      title={count > 1 ? t.app.panel.splitTab(label) : label}
      onClick={() => activateTerminalGroup(groupId)}
      onDoubleClick={() => targetId && startRenameTerminal(targetId)}
    >
      {icon}
      <span className="term-tab-label">{label}</span>
    </button>
  )
}

/**
 * Current shell directory of the active terminal (asked from main on demand): when switching terminals, when the title
 * (foreground process) changes and ~600 ms after an Enter. No polling. Responses for another terminal are ignored.
 */
function useShellCwd(): string | null {
  const activeId = useStore((s) => s.activeTerminalId)
  const title = useStore((s) => s.terminals.find((t) => t.id === s.activeTerminalId)?.title)
  const [known, setKnown] = useState<{ id: string; cwd: string } | null>(null)
  useEffect(() => {
    if (!activeId) return
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = (): void => {
      void fetchCwd(activeId).then((cwd) => {
        if (alive && cwd) setKnown({ id: activeId, cwd })
      })
    }
    refresh()
    const off = onTerminalEnter((id) => {
      if (id !== activeId) return
      clearTimeout(timer)
      timer = setTimeout(refresh, 600)
    })
    return () => {
      alive = false
      clearTimeout(timer)
      off()
    }
  }, [activeId, title])
  return known && known.id === activeId ? known.cwd : null
}

/** Path and branch on the right of the header: cwd of the active shell, or the workspace folder while unknown. */
function TerminalMeta() {
  const workspaceRoot = useStore((s) => s.root)
  const shellCwd = useShellCwd()
  const root = shellCwd ?? workspaceRoot
  const branch = useStore((s) => s.git?.branch ?? null)
  if (!root) return null
  const { parent, leaf } = splitPathParts(tildePath(root, homeDir, platform))
  return (
    <div className="term-meta">
      <span className="term-cwd" title={root}>
        {parent && <span className="term-cwd-parent">{`\u200E${parent}\u200E`}</span>}
        <span className="term-cwd-leaf">{leaf}</span>
      </span>
      {branch && (
        <span className="term-branch" title={branch}>
          <Icon name="branch" />
          <span className="term-branch-label">{branch}</span>
        </span>
      )}
    </div>
  )
}

/** ⋯ menu of the terminal header: panel view switch, terminal and panel actions. */
function TerminalMenu() {
  const t = useT()
  const m = t.app.panel
  const activeId = useStore((s) => s.activeTerminalId)
  const problems = useStore((s) => countListed(s.diagnostics))
  const hasReferences = useStore((s) => s.references !== null)
  const hasHierarchy = useStore((s) => s.hierarchy !== null)
  const position = useStore((s) => s.panelPosition)
  const maximized = useStore((s) => s.panelMaximized)
  const items: MenuEntry[] = [
    {
      id: 'view-problems',
      label: m.problems,
      hint: problems > 0 ? formatNumber(problems) : undefined,
      onSelect: () => showPanel('problems')
    },
    { id: 'view-output', label: m.output, onSelect: () => showPanel('output') },
    { id: 'view-debugConsole', label: m.debugConsole, onSelect: () => showPanel('debugConsole') },
    ...(hasReferences ? [{ id: 'view-references', label: m.references, onSelect: () => showPanel('references') }] : []),
    ...(hasHierarchy ? [{ id: 'view-hierarchy', label: m.hierarchy, onSelect: () => showPanel('hierarchy') }] : []),
    { id: 'profile', label: m.newTerminalWithProfile, separator: true, onSelect: openTerminalProfilePicker },
    { id: 'split', label: m.splitTerminal, disabled: !activeId, onSelect: splitTerminal },
    {
      id: 'kill',
      label: m.killTerminal,
      danger: true,
      disabled: !activeId,
      onSelect: () => activeId && killTerminal(activeId)
    },
    {
      id: 'position',
      label: position === 'bottom' ? m.moveRight : m.moveDown,
      separator: true,
      onSelect: togglePanelPosition
    },
    {
      id: 'maximize',
      label: maximized ? m.restoreSize : m.maximize,
      onSelect: togglePanelMaximized
    }
  ]
  return <DropdownMenu label={m.moreActions} icon={<Icon name="more" />} items={items} />
}

/**
 * Header of the Terminal view (design system Terminal): tabs, "+" right after the last one, path and branch on the
 * right.
 */
function TerminalHeader() {
  const t = useT()
  // The group list only changes when a group is born or dies: avoids a re-render on every new title.
  const groups = useStore(useShallow((s) => groupIds(s.terminals)))
  // Manual activation: activating a terminal focuses xterm and would steal focus from the tabs mid-navigation.
  const onTabsKeyDown = useRovingFocus()
  return (
    <div className="panel-header term-head">
      <div className="term-tabs" role="tablist" aria-label={t.app.panel.terminals} onKeyDown={onTabsKeyDown}>
        {groups.map((g) => (
          <TerminalGroupTab key={g} groupId={g} />
        ))}
      </div>
      <IconButton
        className="term-add"
        label={t.app.panel.newTerminal}
        onClick={() => void createTerminal()}
        glyph="plus"
      />
      <span className="term-spacer" />
      <TerminalMeta />
      <div className="actions">
        <TerminalMenu />
        <IconButton glyph="close" label={t.app.panel.hide} onClick={hidePanel} />
      </div>
    </div>
  )
}

/** Position and size of the panel: they apply to every view. */
function PanelLayoutActions() {
  const t = useT()
  const m = t.app.panel
  const position = useStore((s) => s.panelPosition)
  const maximized = useStore((s) => s.panelMaximized)
  return (
    <>
      <IconButton
        icon={position === 'bottom' ? 'codicon-layout-panel-right' : 'codicon-layout-panel'}
        label={position === 'bottom' ? m.moveRightTitle : m.moveDownTitle}
        onClick={togglePanelPosition}
      />
      <IconButton
        icon={maximized ? 'codicon-chevron-down' : 'codicon-chevron-up'}
        label={maximized ? m.restoreSizeTitle : m.maximizeTitle}
        onClick={togglePanelMaximized}
      />
    </>
  )
}

/**
 * Bottom panel: Problems | Output | References | Terminal (the latter with the shell tab header). Views stay mounted
 * (xterm and the log cannot be recreated).
 */
export function BottomPanel() {
  const t = useT()
  const panelView = useStore((s) => s.panelView)
  // Manual activation: Output and Terminal focus themselves on appearing and would steal focus from the tabs
  // mid-navigation.
  const onTabsKeyDown = useRovingFocus()
  return (
    <div className="panel">
      {panelView === 'terminal' ? (
        <TerminalHeader />
      ) : (
        <div className="panel-header">
          <div className="panel-tabs" role="tablist" aria-label={t.app.panel.tablist} onKeyDown={onTabsKeyDown}>
            {VIEWS.map((view) => (
              <PanelTab key={view} view={view} />
            ))}
          </div>
          <div className="actions">
            {panelView === 'references' && (
              <IconButton icon="codicon-clear-all" label={t.app.panel.clearResults} onClick={clearReferences} />
            )}
            {panelView === 'hierarchy' && (
              <IconButton icon="codicon-clear-all" label={t.app.panel.clearResults} onClick={clearHierarchy} />
            )}
            {panelView === 'debugConsole' && (
              <IconButton icon="codicon-clear-all" label={t.debugUi.console.clear} onClick={clearDebugConsole} />
            )}
            <PanelLayoutActions />
            <IconButton glyph="close" label={t.app.panel.hide} onClick={hidePanel} />
          </div>
        </div>
      )}
      <div className="panel-body">
        {VIEWS.map((view) => {
          const Pane = PANES[view]
          return (
            <div
              key={view}
              id={paneId(view)}
              className="panel-pane"
              role="tabpanel"
              {...(view === 'terminal' ? { 'aria-label': t.app.panel.terminal } : { 'aria-labelledby': tabId(view) })}
              hidden={panelView !== view}
            >
              <Pane />
            </div>
          )
        })}
      </div>
    </div>
  )
}
