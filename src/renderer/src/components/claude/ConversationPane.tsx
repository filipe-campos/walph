import { memo } from 'react'
import { newClaudeConversation, retryWake, startFreshInTab } from '../../claudeLifecycle'
import { openClaudeLogin } from '../../claudeLogin'
import { interruptConversation, retryLastPrompt } from '../../claudePromptActions'
import { useT } from '../../i18n'
import { useStore } from '../../store'
import { selectConversation } from '../../lib/claudeSelectors'
import { LOAD_STEP_TEXT, loadStep, type ClaudeConversation } from '../../lib/claudeConversation'
import { rateLimitKey } from '../../lib/claudeRateLimit'
import { AgentsStrip } from './AgentsStrip'
import { ClaudeFind } from './ClaudeFind'
import { FavoriteCommands } from './FavoriteCommands'
import { PromptBox } from './PromptBox'
import { RateLimitBanner } from './RateLimitBanner'
import { Timeline } from './Timeline'
import { Button } from '../common/Button'

/**
 * Conversation error: without login it explains and offers the terminal; an ended conversation offers to open another.
 */
function Banner({ conversation }: { conversation: ClaudeConversation }) {
  const { error, status } = conversation
  const t = useT()
  const m = t.claude.conversationPane
  if (conversation.dormant && conversation.wakeState === 'failed') {
    return (
      <div className="claude-banner" role="alert">
        <div className="claude-banner-text">
          <i className="codicon codicon-error" />
          <span>{m.wakeFailed}</span>
        </div>
        <div className="claude-card-actions">
          <Button onClick={() => retryWake(conversation.id)}>{t.common.retry}</Button>
          <Button onClick={() => startFreshInTab(conversation.id)}>{m.newConversation}</Button>
        </div>
      </div>
    )
  }
  if (error?.code === 'auth') {
    return (
      <div className="claude-banner" role="alert">
        <div className="claude-banner-text">
          <i className="codicon codicon-account" />
          <span>
            {m.authBefore}
            <code>claude auth login</code>
            {m.authAfter}
          </span>
        </div>
        <div className="claude-card-actions">
          <Button variant="primary" onClick={() => void openClaudeLogin()}>
            {m.login}
          </Button>
          <Button onClick={() => void newClaudeConversation()}>{m.newConversation}</Button>
        </div>
      </div>
    )
  }
  if (error?.code === 'executable') {
    return (
      <div className="claude-banner" role="alert">
        <div className="claude-banner-text">
          <i className="codicon codicon-error" />
          <span>{error.message}</span>
        </div>
      </div>
    )
  }
  // Conversation failure (process crashed, CLI error): the error text and the option to retry the last request.
  if (error && status !== 'closed' && status !== 'working') {
    return (
      <div className="claude-banner" role="alert">
        <div className="claude-banner-text">
          <i className="codicon codicon-error" />
          <span>{error.message}</span>
        </div>
        <div className="claude-card-actions">
          <Button onClick={() => retryLastPrompt(conversation.id)}>{t.common.retry}</Button>
        </div>
      </div>
    )
  }
  if (status === 'closed') {
    return (
      <div className="claude-banner" role="status">
        <div className="claude-banner-text">
          <i className="codicon codicon-info" />
          <span>{error ? error.message : m.closed}</span>
        </div>
        <div className="claude-card-actions">
          <Button onClick={() => void newClaudeConversation()}>{m.newConversation}</Button>
        </div>
      </div>
    )
  }
  return null
}

/**
 * Loading step (waking the tab, starting the session, connecting the MCPs) in place of a field that does not respond
 * yet.
 */
function LoadingNote({ conversation }: { conversation: ClaudeConversation }) {
  useT()
  const step = loadStep(conversation)
  if (!step) return null
  return (
    <div className="claude-loading" role="status" data-testid="claude-loading" data-step={step}>
      <i className="codicon codicon-loading codicon-modifier-spin" aria-hidden />
      <span>{LOAD_STEP_TEXT[step]}</span>
    </div>
  )
}

/**
 * A whole conversation (list + box). All stay mounted and the inactive ones hidden: scroll and draft survive a tab
 * switch.
 */
export const ConversationPane = memo(function ConversationPane({
  id,
  tabKey,
  active
}: {
  id: string
  /** Stable tab key (links the `tabpanel` to the tab that labels it). */
  tabKey: string
  active: boolean
}) {
  // Each pane subscribes to its own conversation: the streaming of one does not re-render the others.
  const conversation = useStore(selectConversation(id))
  const findOpen = useStore((s) => s.claudeFindId === id)
  if (!conversation) return null
  const loading = loadStep(conversation) !== null
  return (
    <div
      className="claude-pane"
      role="tabpanel"
      id={`claude-panel-${tabKey}`}
      aria-labelledby={`claude-tab-${tabKey}`}
      hidden={!active}
      onKeyDown={(e) => {
        // Esc anywhere in the panel (list, cards, buttons) interrupts Claude. Whoever already used the Esc (menus,
        // fields, prompt box) marked the event; text fields have their own Esc.
        if (e.key !== 'Escape' || e.defaultPrevented || e.nativeEvent.isComposing) return
        if (conversation.status !== 'working') return
        if (
          (e.target as HTMLElement).closest(
            'input, textarea, select, [contenteditable="true"], .claude-card, [role="menu"], [role="listbox"]'
          )
        )
          return
        e.preventDefault()
        interruptConversation(conversation.id)
      }}
    >
      {/* A hidden panel/tab does not keep the list in the DOM (nor the markdown being generated); with a pending
          request it stays, so the card draft is not lost (answers, comment). */}
      {(active || conversation.permissions.length > 0) && <Timeline conversation={conversation} active={active} />}
      {findOpen && <ClaudeFind conversationId={conversation.id} active={active} />}
      <Banner conversation={conversation} />
      <LoadingNote conversation={conversation} />
      <AgentsStrip conversation={conversation} active={active} />
      <FavoriteCommands conversationId={conversation.id} commands={conversation.commands} active={active} />
      {conversation.rateLimit && (
        <RateLimitBanner key={rateLimitKey(conversation.rateLimit)} limit={conversation.rateLimit} />
      )}
      <PromptBox
        conversationId={conversation.id}
        suggestion={conversation.suggestion}
        commands={conversation.commands}
        working={conversation.status === 'working'}
        loading={loading}
      />
    </div>
  )
})
