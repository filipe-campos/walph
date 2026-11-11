import { useMemo } from 'react'
import { useT } from '../../i18n'
import type { ClaudeConversation } from '../../lib/claudeConversation'
import { buildTimeline } from '../../lib/claudeTimeline'
import { formatElapsed } from '../../lib/claudeAgents'
import { Icon } from '../common/Icon'
import { useNow } from '../common/useNow'
import { ClaudeMarkdown } from './ClaudeMarkdown'
import { PermissionCard } from './PermissionCards'
import { BackgroundTasks } from './timeline/BackgroundTasks'
import { ItemView } from './timeline/ItemView'
import { RetryLine } from './timeline/RetryLine'
import { ThinkMark, ThinkingWord } from './timeline/ThinkIndicators'
import { TurnSummary } from './timeline/TurnSummary'
import { UserText } from './timeline/UserMessage'
import { ThinkingRow } from './ToolRow'
import { useTimelineScroll } from './useTimelineScroll'

/**
 * Conversation list: messages, streaming, pending requests and queue. Follows the end while the user does not scroll.
 */
export function Timeline({ conversation, active }: { conversation: ClaudeConversation; active: boolean }) {
  const { messages, notes, streaming, permissions, queued, status, waiting, background, retry, toolElapsed } =
    conversation
  const items = useMemo(() => buildTimeline(messages, notes), [messages, notes])
  const busy = status === 'working'
  const { turnStartedAt } = conversation
  const now = useNow(1000, busy && turnStartedAt !== null)
  const t = useT()
  // Memoized set: `waiting.includes` per item would cost O(items x queue) on every render.
  const waitingIds = useMemo(() => new Set(waiting), [waiting])
  // The last user message (text) is the one pinned to the top.
  const lastUserIndex = useMemo(() => items.findLastIndex((i) => i.type === 'user'), [items])
  const lastUserKey = items[lastUserIndex]?.key ?? null
  // "Running" tools: only those of the current turn (after the last user message) and without a result. Only the last
  // one gets the border trace (max live lights: prompt + 1 agent + 1 tool).
  const toolStates = useMemo(() => {
    const states = new Map<string, 'running' | 'live'>()
    if (!busy) return states
    let last: string | null = null
    // The current turn starts at the last user message that is NOT in the queue (the queued ones have not run yet).
    const turnStart = items.findLastIndex((i) => i.type === 'user' && !waitingIds.has(i.uuid))
    for (let i = turnStart + 1; i < items.length; i++) {
      const it = items[i]
      if (it?.type === 'tool' && !it.result) {
        states.set(it.key, 'running')
        last = it.key
      }
    }
    if (last) states.set(last, 'live')
    return states
  }, [items, busy, waitingIds])

  const { scrollRef, onScroll } = useTimelineScroll({
    conversationId: conversation.id,
    items,
    lastUserIndex,
    streaming,
    permissions,
    queued,
    background,
    busy,
    active
  })

  const live = [...streaming].sort((a, b) => a.index - b.index)
  const empty = items.length === 0 && live.length === 0 && queued.length === 0

  return (
    <div
      className="claude-timeline"
      ref={scrollRef}
      onScroll={onScroll}
      role="log"
      aria-label={t.claude.timeline.label}
      aria-busy={busy}
    >
      {empty && !busy && permissions.length === 0 && (
        <div className="claude-empty">
          <span className="claude-empty-mark">
            <Icon name="brain" />
          </span>
          <div className="claude-empty-title">{t.claude.timeline.emptyTitle}</div>
          <p className="claude-empty-text">{t.claude.timeline.emptyText}</p>
          <p className="claude-empty-text">{t.claude.timeline.emptyHint}</p>
        </div>
      )}
      {items.map((item) => (
        <ItemView
          key={item.key}
          conversationId={conversation.id}
          item={item}
          busy={busy}
          waiting={item.type === 'user' && waitingIds.has(item.uuid)}
          pinned={item.key === lastUserKey}
          scrollRef={scrollRef}
          tool={toolStates.get(item.key) ?? null}
          elapsed={item.type === 'tool' ? toolElapsed[item.toolUseId] : undefined}
        />
      ))}
      {live.map((block) =>
        block.kind === 'text' ? (
          <ClaudeMarkdown key={`s${block.index}t`} text={block.text} live />
        ) : (
          <ThinkingRow
            key={`s${block.index}k`}
            text={block.text}
            live
            seed={`${lastUserKey ?? conversation.id}:${block.index}`}
          />
        )
      )}
      {permissions.map((request) => (
        <PermissionCard key={request.requestId} conversationId={conversation.id} request={request} />
      ))}
      {!busy && permissions.length === 0 && <TurnSummary messages={messages} durationMs={conversation.lastTurnMs} />}
      {queued.map((q) => (
        <div key={q.key} className="claude-user queued">
          <UserText conversationId={conversation.id} text={q.text} />
          <div className="claude-user-meta claude-sending muted" role="status">
            <i className="codicon codicon-loading codicon-modifier-spin" aria-hidden />
            {t.claude.timeline.sending}
          </div>
        </div>
      ))}
      {!busy && background.length > 0 && <BackgroundTasks conversationId={conversation.id} tasks={background} />}
      {busy && retry && <RetryLine key={retry.timestamp} retry={retry} active={active} />}
      {busy && !retry && live.length === 0 && permissions.length === 0 && (
        <div className="claude-working" role="status">
          <span className="sr-only">{t.claude.timeline.thinking}</span>
          <ThinkMark />
          <ThinkingWord seed={lastUserKey ?? conversation.id} />
          {turnStartedAt !== null && (
            <span className="claude-working-time muted" aria-hidden="true" data-testid="claude-elapsed">
              {formatElapsed(Math.max(0, now - turnStartedAt))}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
