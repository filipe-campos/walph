import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  activateConversation,
  closeActiveClaudeSession,
  closeConversation,
  hideClaude,
  newClaudeConversation
} from '../../claudeLifecycle'
import { logoutClaude, openClaudeLogin } from '../../claudeLogin'
import { openClaudeMcp, openClaudeUsage } from '../../claudeMcpActions'
import { askClaude, compactConversation } from '../../claudePromptActions'
import {
  duplicateConversation,
  exportConversation,
  renameConversation,
  startRename,
  stopRename,
  toggleFavorite
} from '../../claudeSessionMeta'
import { focusPrompt } from '../../claudePromptBridge'
import { capCount } from '../../lib/capCount'
import { contextLevel, formatCost } from '../../lib/claudeFormat'
import { accountText } from '../../lib/claudeUsage'
import { selectActiveConversation } from '../../lib/claudeSelectors'
import { useShortcutLabel } from '../common/useShortcutLabel'
import { useStore } from '../../store'
import { useT } from '../../i18n'
import { DropdownMenu } from '../common/DropdownMenu'
import type { MenuEntry } from '../common/MenuList'
import { Icon } from '../common/Icon'
import { IconButton } from '../common/IconButton'
import { InlineEdit } from '../common/InlineEdit'
import { StatusDot } from '../common/StatusDot'
import { useFocusRegion } from '../common/useFocusRegion'
import { useRovingFocus } from '../common/useRovingFocus'
import { ConversationPane } from './ConversationPane'
import { SessionHistory } from './SessionHistory'
import { useActiveConversationField, useConversationField } from './useConversation'
import { Button } from '../common/Button'

/** Title field on the tab: Enter and leaving the field confirm, Esc cancels, empty goes back to the automatic title. */
function RenameInput({ id, initial, active }: { id: string; initial: string; active: boolean }) {
  const t = useT()
  const commit = (value: string, via: 'enter' | 'blur'): void => {
    // Without a change nothing is saved (otherwise the automatic title would become "the user's").
    if (value.trim() === initial.trim()) stopRename()
    else void renameConversation(id, value)
    if (via === 'enter' && active) focusPrompt()
  }
  const cancel = (): void => {
    stopRename()
    if (active) focusPrompt()
  }
  return (
    <InlineEdit
      className="claude-tab-input"
      data-rename-input
      aria-label={t.claude.panel.renameSession}
      maxLength={80}
      initial={initial}
      stopKeys
      stopClicks
      onCommit={commit}
      onCancel={cancel}
    />
  )
}

/**
 * A conversation tab: selects only what it shows, so the streaming of one conversation does not re-render the other
 * tabs.
 */
function ConversationTab({ id, tabKey }: { id: string; tabKey: string }) {
  const active = useStore((s) => s.claude.activeId === id)
  const title = useConversationField(id, (c) => c.title, '')
  // Status and unread come from main (`sessionStatus`); the count only shows on inactive tabs.
  const status = useConversationField(id, (c) => c.agentStatus, 'idle')
  const unread = useConversationField(id, (c) => c.unread, 0)
  const favorite = useConversationField(id, (c) => c.favorite, false)
  const renaming = useStore((s) => s.claude.renamingId === id)
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)

  // The active tab always in view, even with many tabs scrolling in the strip.
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active])

  return (
    // The × stays OUTSIDE the `role=tab` (a button inside a tab is not valid); the wrapper carries the tab look.
    <div
      className={`claude-tab-wrap${active ? ' active' : ''}${status === 'running' ? ' running' : ''}`}
      data-status={status}
    >
      <div
        ref={ref}
        role="tab"
        id={`claude-tab-${tabKey}`}
        aria-selected={active}
        aria-controls={`claude-panel-${tabKey}`}
        tabIndex={active ? 0 : -1}
        className={`claude-tab${active ? ' active' : ''}${status === 'running' ? ' running' : ''}`}
        data-status={status}
        data-session-tab={id}
        data-favorite={favorite}
        title={title}
        onClick={() => activateConversation(id)}
        onDoubleClick={() => startRename(id)}
        onKeyDown={(e) => {
          // Keys from a child (the rename field) do not activate the tab.
          if (e.target !== e.currentTarget) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            activateConversation(id)
          }
        }}
        onAuxClick={(e) => e.button === 1 && void closeConversation(id)}
      >
        <StatusDot status={status} />
        {favorite && <Icon name="star" className="claude-tab-star" role="img" aria-label={t.claude.panel.favorite} />}
        {renaming ? (
          <RenameInput id={id} initial={title} active={active} />
        ) : (
          <span className="claude-tab-label">{title}</span>
        )}
        {!active && unread > 0 && (
          <span
            className="claude-tab-unread"
            role="img"
            aria-label={t.claude.panel.unread(unread)}
            title={t.claude.panel.unread(unread)}
          >
            {capCount(unread, 9)}
          </span>
        )}
      </div>
      <button
        className="tab-close claude-tab-close"
        title={t.claude.panel.closeConversation}
        aria-label={t.claude.panel.closeTitle(title)}
        onClick={() => void closeConversation(id)}
      >
        <Icon name="close" />
      </button>
    </div>
  )
}

/**
 * Star and ⋯ menu: actions of the active session and, in the same menu, the history and close panel (no loose buttons
 * on the bar).
 */
function SessionActions({ historyOpen, onHistory }: { historyOpen: boolean; onHistory: () => void }) {
  const id = useStore((s) => s.claude.activeId)
  const { favorite, ready, hasMessages, idle, context, costUsd, account } = useStore(
    useShallow((s) => {
      const active = selectActiveConversation(s)
      return {
        favorite: active?.favorite ?? false,
        ready: !!active?.sessionId,
        hasMessages: (active?.messages.length ?? 0) > 0,
        idle: active?.status === 'idle' && !active.dormant,
        // Context usage and cost (formerly in a bar under the field, which the design system does not have): they go to
        // the menu; the ⋯ button gets a warning dot when the context is high or full.
        context: active?.context ?? null,
        costUsd: active?.costUsd ?? 0,
        account: active?.account ?? null
      }
    })
  )
  const level = contextLevel(context)
  const accountLabel = accountText(account)
  const renameHint = useShortcutLabel('claude.renameSession')
  const closeHint = useShortcutLabel('claude.closeSession')
  const t = useT()
  const m = t.claude.panel

  // With no open session the menu is still useful (history, close panel): the session items are disabled.
  const items: MenuEntry[] = [
    {
      id: 'rename',
      label: t.common.rename,
      hint: renameHint,
      disabled: !id || !ready,
      onSelect: () => id && startRename(id)
    },
    {
      id: 'duplicate',
      label: m.duplicate,
      disabled: !id || !hasMessages,
      onSelect: () => id && void duplicateConversation(id)
    },
    {
      id: 'export',
      label: m.exportConversation,
      disabled: !id || !hasMessages,
      onSelect: () => id && void exportConversation(id)
    },
    {
      id: 'compact',
      label: m.compactContext,
      hint: context ? `${Math.round(context.percentage)}%` : undefined,
      disabled: !id || !idle,
      onSelect: () => id && compactConversation(id)
    },
    ...(costUsd > 0
      ? [{ id: 'cost', label: m.sessionCost(formatCost(costUsd)), disabled: true, onSelect: () => {} }]
      : []),
    {
      id: 'usage',
      label: m.planUsage,
      disabled: !id,
      separator: true,
      onSelect: () => id && void openClaudeUsage(id)
    },
    ...(accountLabel
      ? [
          { id: 'account', label: m.account(accountLabel), disabled: true, onSelect: () => {} },
          { id: 'logout', label: m.logout, onSelect: () => void logoutClaude() }
        ]
      : [{ id: 'login', label: m.login, onSelect: () => void openClaudeLogin() }]),
    {
      id: 'mcp',
      label: m.mcpServers,
      disabled: !id,
      onSelect: () => id && void openClaudeMcp(id)
    },
    {
      id: 'history',
      label: historyOpen ? m.closeHistory : m.previousConversations,
      onSelect: onHistory
    },
    { id: 'hide', label: m.hidePanel, onSelect: hideClaude },
    {
      id: 'close',
      label: m.closeSession,
      hint: closeHint,
      danger: true,
      disabled: !id,
      separator: true,
      onSelect: closeActiveClaudeSession
    }
  ]

  return (
    <>
      <IconButton
        className="claude-star"
        title={favorite ? m.unfavorite : m.favoriteSession}
        label={m.favoriteSession}
        pressed={favorite}
        data-favorite={favorite}
        disabled={!id || !ready}
        onClick={() => id && void toggleFavorite(id)}
      >
        <Icon name="star" key={String(favorite)} />
      </IconButton>
      <DropdownMenu
        label={level !== 'ok' && context ? m.moreActionsContext(Math.round(context.percentage)) : m.moreActions}
        className={level === 'ok' ? 'claude-more' : `claude-more context-${level}`}
        icon={<Icon name="more" />}
        items={items}
      />
    </>
  )
}

/** Conversation tabs + header actions. */
interface PaneEntry {
  key: string
  id: string
}

function Header({
  entries,
  historyOpen,
  onHistory
}: {
  entries: PaneEntry[]
  historyOpen: boolean
  onHistory: () => void
}) {
  const starting = useStore((s) => s.claude.starting)
  // The mark gets a halo while the active session runs.
  const live = useActiveConversationField((c) => c.agentStatus === 'running', false)

  const t = useT()
  const stripRef = useRef<HTMLDivElement>(null)
  const onTabsKeyDown = useRovingFocus({ activate: true })
  // Resizing the panel can push the active tab out of the strip: keeps it in view.
  useEffect(() => {
    const strip = stripRef.current
    if (!strip || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() =>
      strip.querySelector('[role="tab"][aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    )
    observer.observe(strip)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="claude-header">
      <span className={`claude-mark${live ? ' live' : ''}`} title="Claude Code">
        <Icon name="brain" />
      </span>
      <div
        ref={stripRef}
        className="claude-tabs"
        role="tablist"
        aria-label={t.claude.panel.conversations}
        onKeyDown={onTabsKeyDown}
      >
        {entries.map((e) => (
          <ConversationTab key={e.key} id={e.id} tabKey={e.key} />
        ))}
      </div>
      <div className="actions">
        <IconButton
          glyph="plus"
          label={t.claude.panel.newConversation}
          disabled={starting}
          onClick={() => void newClaudeConversation()}
        />
        <SessionActions historyOpen={historyOpen} onHistory={onHistory} />
      </div>
    </div>
  )
}

/** Claude Code panel (secondary sidebar). Stays mounted even when hidden to keep the conversations on screen. */
export function ClaudePanel() {
  // Only the ids: the content of each conversation is the pane's own business.
  const keyed = useStore(useShallow((s) => s.claude.conversations.map((c) => `${c.tabKey ?? c.id}\n${c.id}`)))
  // `key` is stable when the dormant id is swapped for the real one: the tab, the pane and the prompt box do not
  // remount (focus and rename stay).
  const entries = keyed.map((k): PaneEntry => {
    const [key = '', id = ''] = k.split('\n')
    return { key, id }
  })
  const activeId = useStore((s) => s.claude.activeId)
  const starting = useStore((s) => s.claude.starting)
  const visible = useStore((s) => s.claudeVisible)
  const hasRoot = useStore((s) => !!s.root)
  const newHint = useShortcutLabel('claude.newConversation')
  const panelRef = useFocusRegion<HTMLDivElement>('claudePanel')
  const newButtonRef = useFocusRegion<HTMLButtonElement>('claudeNewConversation')
  const [historyOpen, setHistoryOpen] = useState(false)
  const t = useT()
  const m = t.claude.panel

  return (
    <div ref={panelRef} className="claude-panel" role="region" aria-label="Claude Code">
      <Header entries={entries} historyOpen={historyOpen} onHistory={() => setHistoryOpen(!historyOpen)} />
      <div className="claude-body">
        {historyOpen && (
          <SessionHistory
            onClose={() => {
              setHistoryOpen(false)
              // The list (and the search field) leave the DOM with focus inside: back to the prompt.
              focusPrompt()
            }}
          />
        )}
        {entries.map((e) => (
          <ConversationPane key={e.key} id={e.id} tabKey={e.key} active={visible && e.id === activeId} />
        ))}
        {entries.length === 0 && (
          <div className="claude-empty claude-empty-panel">
            <span className="claude-empty-mark">
              <Icon name="brain" />
            </span>
            {!hasRoot ? (
              <p className="claude-empty-text">{m.openFolder}</p>
            ) : starting ? (
              <p className="claude-empty-text">
                <i className="codicon codicon-loading codicon-modifier-spin" /> {m.starting}
              </p>
            ) : (
              <>
                <div className="claude-empty-title">{m.emptyTitle}</div>
                <p className="claude-empty-text">{m.emptyText}</p>
                <div className="claude-empty-cta">
                  <Button variant="primary" ref={newButtonRef} onClick={() => void newClaudeConversation()}>
                    {m.newConversation}
                  </Button>
                  {newHint && <kbd className="claude-empty-kbd">{newHint}</kbd>}
                </div>
                <div className="claude-empty-chips" role="group" aria-label={m.suggestions}>
                  {[m.suggestExplain, m.suggestBugs, m.suggestTests].map((q) => (
                    <button key={q} type="button" className="claude-empty-chip" onClick={() => void askClaude(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
