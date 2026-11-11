import { lazy, memo, Suspense, useCallback, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { MAX_EDITOR_GROUPS, type GroupSide } from '@shared/editorLayout'
import { useStore } from '../../store'
import type { EditorGroup as EditorGroupState } from '../../lib/editorGroups'
import type { Tab } from '../../types/tabs'
import { focusClaude, hideClaude } from '../../claudeLifecycle'
import { useShortcutLabel } from '../common/useShortcutLabel'
import { isMarkdownPath } from '../../lib/markdownPreview'
import { basename } from '../../lib/path'
import { selectTab } from '../../lib/tabSelectors'
import { dropIndex } from '../../lib/tabOrder'
import { FileIcon } from '../common/FileIcon'
import { Icon } from '../common/Icon'
import { IconButton } from '../common/IconButton'
import { useRequest } from '../common/useRequest'
import { useRovingFocus } from '../common/useRovingFocus'
import { Welcome } from '../Welcome'
import { useT } from '../../i18n'
import { CodeEditor } from './CodeEditor'
import { getView, shownTabId } from './groupViews'
import {
  activateGroup,
  activateTab,
  closeTab,
  dropTabOnGroup,
  moveTab,
  openImage,
  openMarkdownPreview,
  isSvgPath,
  pinTab,
  showTabMenu,
  splitEditor
} from '../../tabActions'

// Diff (@codemirror/merge), Markdown preview and image viewer only load when the first tab of that kind opens.
const DiffEditor = lazy(() => import('./DiffEditor').then((m) => ({ default: m.DiffEditor })))
const MarkdownPreview = lazy(() => import('./MarkdownPreview').then((m) => ({ default: m.MarkdownPreview })))
const ImageViewer = lazy(() => import('./ImageViewer').then((m) => ({ default: m.ImageViewer })))

// Own type in the drag: dropping an OS file or arbitrary text on the bar reorders nothing. The source group
// travels in a second type (`dragover` only sees the types, not the values).
const TAB_DRAG_TYPE = 'application/x-walph-tab'
const GROUP_DRAG_TYPE = 'application/x-walph-tab-group'
// The drag values only show up on `drop`; `dragover` (which decides the highlighted zone) reads the source from here.
let dragSource: { tabId: string; groupId: string } | null = null
/** Fraction of each edge of the group body that, when a tab is dropped, splits the group on that side. */
const EDGE_DROP_ZONE = 0.25

type BodyDrop = GroupSide | 'center'

function dropZone(e: React.DragEvent<HTMLElement>, canSplit: boolean): BodyDrop {
  if (!canSplit) return 'center'
  const r = e.currentTarget.getBoundingClientRect()
  const fx = r.width > 0 ? (e.clientX - r.left) / r.width : 0.5
  const fy = r.height > 0 ? (e.clientY - r.top) / r.height : 0.5
  const edges: [GroupSide, number][] = [
    ['left', fx],
    ['right', 1 - fx],
    ['up', fy],
    ['down', 1 - fy]
  ]
  let best: [GroupSide, number] = ['left', Infinity]
  for (const edge of edges) if (edge[1] < best[1]) best = edge
  return best[1] < EDGE_DROP_ZONE ? best[0] : 'center'
}

const editorPanelId = (groupId: string): string => `editor-panel-${groupId}`

interface DropTarget {
  id: string
  side: 'before' | 'after'
}

const TabItem = memo(function TabItem({
  tab,
  groupId,
  panelId,
  active,
  drop,
  onDragTarget,
  onDragEnd
}: {
  tab: Tab
  groupId: string
  panelId: string
  active: boolean
  drop: DropTarget | null
  onDragTarget: (target: DropTarget) => void
  onDragEnd: () => void
}) {
  const t = useT()
  const file = tab.kind === 'file' ? tab : null
  const commit = tab.kind === 'diff' ? tab.commit : undefined
  const compare = tab.kind === 'diff' ? tab.compare : undefined
  const sideName = (side: { path: string; saved?: boolean }): string =>
    side.saved ? `${basename(side.path)} ${t.editor.diff.savedSuffix}` : basename(side.path)
  const dirty = !!file?.dirty
  const preview = !!file?.preview
  const deleted = !!file?.deleted
  const classes = ['tab', active && 'active', dirty && 'dirty', preview && 'preview', deleted && 'deleted']
  if (drop) classes.push(`drop-${drop.side}`)

  return (
    <div
      role="tab"
      aria-selected={active}
      aria-controls={panelId}
      tabIndex={active ? 0 : -1}
      className={classes.filter(Boolean).join(' ')}
      title={
        deleted
          ? t.editor.tabs.deletedTitle(tab.path)
          : commit
            ? t.editor.tabs.commitTitle(tab.path, commit.hash.slice(0, 7))
            : compare
              ? t.editor.diff.compareFiles(compare.left.path, compare.right.path)
              : tab.kind === 'markdownPreview'
                ? t.editor.tabs.previewTitle(tab.path)
                : tab.path
      }
      draggable
      onClick={() => activateTab(tab.id, groupId)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
        e.preventDefault()
        activateTab(tab.id, groupId)
      }}
      onDoubleClick={() => pinTab(tab.id)}
      onAuxClick={(e) => e.button === 1 && void closeTab(tab.id, groupId)}
      onContextMenu={(e) => {
        e.preventDefault()
        void showTabMenu(tab.id, groupId)
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData(TAB_DRAG_TYPE, tab.id)
        e.dataTransfer.setData(GROUP_DRAG_TYPE, groupId)
        e.dataTransfer.effectAllowed = 'move'
        dragSource = { tabId: tab.id, groupId }
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return
        e.preventDefault()
        e.stopPropagation()
        const rect = e.currentTarget.getBoundingClientRect()
        onDragTarget({ id: tab.id, side: e.clientX < rect.left + rect.width / 2 ? 'before' : 'after' })
      }}
      onDragEnd={() => {
        dragSource = null
        onDragEnd()
      }}
    >
      {tab.kind === 'diff' ? (
        <Icon name="diff" className="tab-icon" />
      ) : tab.kind === 'markdownPreview' ? (
        <Icon name="markdown" className="tab-icon" />
      ) : (
        <FileIcon name={tab.path} className="tab-icon" />
      )}
      <span className="tab-label">
        {tab.kind === 'markdownPreview'
          ? t.editor.tabs.previewLabel(basename(tab.path))
          : compare
            ? t.editor.diff.compareFiles(sideName(compare.left), sideName(compare.right))
            : basename(tab.path)}
        {tab.kind === 'diff' && !compare && (
          <span className="muted">
            {' '}
            {commit
              ? `(${commit.hash.slice(0, 7)})`
              : tab.proposal
                ? '(Claude)'
                : tab.staged
                  ? t.editor.tabs.stagedSuffix
                  : t.editor.tabs.changesSuffix}
          </span>
        )}
      </span>
      <button
        className="tab-close"
        title={t.common.close}
        tabIndex={-1}
        aria-hidden
        onClick={(e) => {
          e.stopPropagation()
          void closeTab(tab.id, groupId)
        }}
      >
        {/* Dirty: a dot in place of the "x", which comes back on hover (CSS). */}
        {dirty && <span className="tab-dirty" />}
        <Icon name="close" className="tab-close-icon" />
      </button>
    </div>
  )
})

function TabBar({ group, tabs }: { group: EditorGroupState; tabs: Tab[] }) {
  // Only exists during a drag, so it stays local.
  const t = useT()
  const [drop, setDrop] = useState<DropTarget | null>(null)
  const onTabsKeyDown = useRovingFocus({ activate: true })
  const onDragTarget = useCallback(
    (target: DropTarget) => setDrop((d) => (d?.id === target.id && d.side === target.side ? d : target)),
    []
  )
  const onDragEnd = useCallback(() => setDrop(null), [])

  const finish = (e: React.DragEvent): void => {
    const id = e.dataTransfer.getData(TAB_DRAG_TYPE)
    const fromGroup = e.dataTransfer.getData(GROUP_DRAG_TYPE)
    const target = drop
    setDrop(null)
    if (!id || !target) return
    e.preventDefault()
    const to = group.tabIds.indexOf(target.id)
    if (to < 0) return
    const from = group.tabIds.indexOf(id)
    // Within the group it reorders; coming from the other group, the tab enters at the drop position.
    if (from >= 0) moveTab(id, dropIndex(from, to, target.side), group.id, group.id)
    else moveTab(id, to + (target.side === 'after' ? 1 : 0), group.id, fromGroup || undefined)
  }

  return (
    <div
      className="tab-bar"
      role="tablist"
      aria-label={t.editor.tabs.tabsLabel}
      onKeyDown={onTabsKeyDown}
      onDragOver={(e) => {
        // Empty area of the bar = drop at the end.
        if (!e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return
        e.preventDefault()
        const last = tabs[tabs.length - 1]
        if (last) setDrop({ id: last.id, side: 'after' })
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop(null)
      }}
      onDrop={finish}
    >
      {tabs.map((tab) => (
        <TabItem
          key={tab.id}
          tab={tab}
          groupId={group.id}
          panelId={editorPanelId(group.id)}
          active={tab.id === group.activeTabId}
          drop={drop?.id === tab.id ? drop : null}
          onDragTarget={onDragTarget}
          onDragEnd={onDragEnd}
        />
      ))}
    </div>
  )
}

/** Actions on the right of a group tab strip: Markdown preview, split and (only in the edge group) Claude. */
function EditorActions({ group, last }: { group: EditorGroupState; last: boolean }) {
  const t = useT()
  const claudeVisible = useStore((s) => s.claudeVisible)
  const claudeShortcut = useShortcutLabel('claude.focus')
  const splitShortcut = useShortcutLabel('editor.splitRight')
  const previewShortcut = useShortcutLabel('editor.markdownPreview')
  // Only `.md`/`.mdx` files; the on state is "there is a preview of this file open".
  const markdownPath = useStore((s) => {
    const tab = selectTab(group.activeTabId)(s)
    return tab?.kind === 'file' && isMarkdownPath(tab.path) ? tab.path : null
  })
  const svgPath = useStore((s) => {
    const tab = selectTab(group.activeTabId)(s)
    return tab?.kind === 'file' && isSvgPath(tab.path) ? tab.path : null
  })
  const previewId = useStore((s) =>
    markdownPath ? (s.tabs.find((t) => t.kind === 'markdownPreview' && t.path === markdownPath)?.id ?? null) : null
  )
  const atLimit = useStore((s) => s.editorGroups.length >= MAX_EDITOR_GROUPS)

  return (
    <div className="editor-actions">
      {markdownPath && (
        <IconButton
          icon="codicon-open-preview"
          label={previewId ? t.editor.actions.closePreviewToSide : t.editor.actions.openPreviewToSide}
          shortcut={previewShortcut}
          active={!!previewId}
          pressed={!!previewId}
          onClick={() => {
            if (previewId) return void closeTab(previewId)
            activateGroup(group.id)
            openMarkdownPreview()
          }}
        />
      )}
      {svgPath && (
        <IconButton
          icon="codicon-open-preview"
          label={t.editor.actions.openImagePreview}
          onClick={() => openImage(svgPath)}
        />
      )}
      <IconButton
        glyph="split"
        label={t.editor.actions.splitEditor}
        shortcut={splitShortcut}
        disabled={atLimit || !group.activeTabId}
        onClick={(e) => {
          activateGroup(group.id)
          // With Alt, splits down (as in VS Code).
          splitEditor(e.altKey ? 'down' : 'right')
        }}
      />
      {last && (
        <IconButton
          glyph="brain"
          label={claudeVisible ? t.editor.actions.closeClaude : t.editor.actions.openClaude}
          shortcut={claudeShortcut}
          active={claudeVisible}
          pressed={claudeVisible}
          onClick={() => (claudeVisible ? hideClaude() : focusClaude())}
        />
      )}
    </div>
  )
}

/** An editor column: tab strip, actions and the content of the group active tab. */
export function EditorGroup({ groupId, last }: { groupId: string; last: boolean }) {
  const t = useT()
  const group = useStore((s) => s.editorGroups.find((g) => g.id === groupId))
  // Only this group's tabs, compared by reference: editing one tab does not re-render the others.
  const tabs = useStore(
    useShallow((s) => {
      return (s.editorGroups.find((g) => g.id === groupId)?.tabIds ?? []).flatMap((id) => selectTab(id)(s) ?? [])
    })
  )
  const active = useStore((s) => s.activeGroupId === groupId)
  const hasRoot = useStore((s) => !!s.root)
  const canSplit = useStore((s) => s.editorGroups.length < MAX_EDITOR_GROUPS)
  const ref = useRef<HTMLDivElement>(null)
  // Dragging a tab over the editor body: the center moves the tab to this group, an edge splits the group.
  const [bodyDrop, setBodyDrop] = useState<BodyDrop | null>(null)

  const activeTab = selectTab(group?.activeTabId)({ tabs }) ?? null

  // Focus request (split, focus the other group): the group editor, or the group itself if it shows a diff/preview.
  useRequest(
    'groupFocus',
    () => {
      const view = getView(groupId)
      if (view && shownTabId(groupId)) view.focus()
      // In the preview, focus goes to it (`markdownPreviewFocus` context: ⇧⌘V again goes back to the file).
      else (ref.current?.querySelector<HTMLElement>('.markdown-preview') ?? ref.current)?.focus()
    },
    (payload) => payload.groupId === groupId
  )

  if (!group) return null
  return (
    <div
      ref={ref}
      className={`editor-group${active ? ' active' : ''}`}
      tabIndex={-1}
      // A click or focus anywhere in the group makes it the active one (commands, LSP and status bar follow it).
      onMouseDownCapture={() => activateGroup(groupId)}
      onFocus={() => activateGroup(groupId)}
    >
      {(tabs.length > 0 || hasRoot) && (
        <div className="tab-row">
          {tabs.length > 0 ? <TabBar group={group} tabs={tabs} /> : <div className="tab-row-spacer" />}
          {hasRoot && <EditorActions group={group} last={last} />}
        </div>
      )}
      <div
        id={editorPanelId(groupId)}
        role="tabpanel"
        aria-label={activeTab ? basename(activeTab.path) : t.editor.tabs.editorLabel}
        className={`editor-content${bodyDrop ? ` drop-target drop-${bodyDrop}` : ''}`}
        onDragOverCapture={(e) => {
          if (!e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return
          const zone = dropZone(e, canSplit)
          // In the same group, the center moves nothing and the edge only splits if a tab is left on this side.
          const own = dragSource?.groupId === groupId
          if (own && (zone === 'center' || group.tabIds.length < 2)) return setBodyDrop(null)
          e.preventDefault()
          e.stopPropagation()
          setBodyDrop(zone)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setBodyDrop(null)
        }}
        onDropCapture={(e) => {
          const zone = bodyDrop
          setBodyDrop(null)
          const id = e.dataTransfer.getData(TAB_DRAG_TYPE)
          const from = e.dataTransfer.getData(GROUP_DRAG_TYPE)
          if (!id || !zone) return
          e.preventDefault()
          e.stopPropagation()
          dropTabOnGroup(id, groupId, zone, from || undefined)
        }}
      >
        <CodeEditor groupId={groupId} tab={activeTab?.kind === 'file' ? activeTab : null} />
        {activeTab?.kind === 'diff' && (
          <Suspense fallback={null}>
            <DiffEditor key={activeTab.id} tab={activeTab} />
          </Suspense>
        )}
        {activeTab?.kind === 'markdownPreview' && (
          <Suspense fallback={null}>
            <MarkdownPreview key={activeTab.id} tab={activeTab} />
          </Suspense>
        )}
        {activeTab?.kind === 'image' && (
          <Suspense fallback={null}>
            <ImageViewer key={activeTab.id} tab={activeTab} />
          </Suspense>
        )}
        {!activeTab && <Welcome />}
      </div>
    </div>
  )
}
