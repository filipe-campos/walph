import { memo, useState } from 'react'
import { isTaskNoticeProblem, taskNoticeText } from '../../../lib/claudeContext'
import { formatTokens } from '../../../lib/claudeFormat'
import { deniedToolLabel } from '../../../lib/claudeProgress'
import { formatFullDate, formatTime } from '../../../lib/claudeTime'
import type { TimelineItem } from '../../../lib/claudeTimeline'
import { useT } from '../../../i18n'
import { Button } from '../../common/Button'
import { CopyButton } from '../../common/CopyButton'
import { Icon } from '../../common/Icon'
import { ClaudeMarkdown } from '../ClaudeMarkdown'
import { ThinkingRow, ToolRow } from '../ToolRow'
import { MessageTime } from './MessageTime'
import { PinnedPrompt } from './PinnedPrompt'
import { UserMessage, UserText } from './UserMessage'

interface ItemProps {
  conversationId: string
  item: TimelineItem
  busy: boolean
  /** User message in the CLI queue. */
  waiting: boolean
  /** It is the last user message: stays pinned to the top while the response scrolls. */
  pinned: boolean
  scrollRef: React.RefObject<HTMLDivElement | null>
  /** Tools only: `running` = no result in the current turn; `live` = the one that gets the border trace. */
  tool: 'running' | 'live' | null
  /** Tools only: seconds of execution (`toolProgress`). */
  elapsed?: number | undefined
}

export const ItemView = memo(function ItemView({
  conversationId,
  item,
  busy,
  waiting,
  pinned,
  scrollRef,
  tool,
  elapsed
}: ItemProps) {
  const m = useT().claude.timelineParts
  switch (item.type) {
    case 'user':
      // The wrapper exists on every user message (only `pinned` changes): the previous one does not remount when
      // another arrives.
      return (
        <PinnedPrompt
          scrollRef={scrollRef}
          pinned={pinned}
          compact={pinned && <UserText conversationId={conversationId} text={item.text} />}
        >
          <UserMessage conversationId={conversationId} item={item} busy={busy} waiting={waiting} />
        </PinnedPrompt>
      )
    case 'text':
      return (
        <div className={`claude-text-item${item.depth ? ' claude-nested' : ''}`}>
          <ClaudeMarkdown text={item.text} />
          {/* End of turn: time and copy. In the current turn the last text may still receive more. */}
          {item.turnEnd && !(item.lastTurn && busy) && (
            <div className="claude-text-foot">
              <MessageTime timestamp={item.timestamp} />
              <CopyButton text={item.text} label={m.copyReply} className="claude-copy" />
            </div>
          )}
        </div>
      )
    case 'commandOutput':
      return <CommandOutput text={item.text} timestamp={item.timestamp} />
    case 'compacted':
      return (
        <div className="claude-compacted" role="separator" aria-label={m.compacted}>
          <span>
            {m.compactedDetail(item.preTokens ? formatTokens(item.preTokens) : null, item.trigger === 'auto')}
          </span>
        </div>
      )
    case 'autoTurn': {
      // Turn without a user message: the marker separates the response from the previous turn.
      const label = item.reason === 'scheduled' ? m.scheduledRun : m.backgroundDone
      return (
        <div className="claude-compacted" role="separator" aria-label={label}>
          <span title={formatFullDate(item.timestamp)}>
            {label} · {formatTime(item.timestamp)}
          </span>
        </div>
      )
    }
    case 'taskNotice': {
      const problem = isTaskNoticeProblem(item.status)
      return (
        <div
          className={`claude-task-notice${problem ? ' problem' : ''}`}
          role="status"
          data-testid="claude-task-notice"
        >
          <Icon name={problem ? 'alert' : 'check'} />
          <span title={item.summary}>{taskNoticeText(item.summary, item.status)}</span>
          {item.timestamp && <MessageTime timestamp={item.timestamp} />}
        </div>
      )
    }
    case 'denied':
      return <DeniedNote toolUseId={item.toolUseId} toolName={item.toolName} reason={item.reason} />
    case 'thinking':
      return <ThinkingRow text={item.text} nested={item.depth === 1} />
    case 'tool':
      return (
        <ToolRow
          name={item.name}
          input={item.input}
          result={item.result}
          running={tool !== null}
          live={tool === 'live'}
          nested={item.depth === 1}
          elapsed={elapsed}
        />
      )
  }
}, sameItemProps)

/**
 * Equal props? `item` is rebuilt on every message, but only changes content when it really changed (shallow fields).
 */
function sameItemProps(a: ItemProps, b: ItemProps): boolean {
  if (
    a.conversationId !== b.conversationId ||
    a.busy !== b.busy ||
    a.waiting !== b.waiting ||
    a.pinned !== b.pinned ||
    a.scrollRef !== b.scrollRef ||
    a.tool !== b.tool ||
    a.elapsed !== b.elapsed
  )
    return false
  if (a.item === b.item) return true
  const x = a.item as Record<string, unknown>
  const y = b.item as Record<string, unknown>
  const keys = Object.keys(x)
  return keys.length === Object.keys(y).length && keys.every((k) => x[k] === y[k])
}

/** Call denied without a question (Auto mode classifier, `deny` rule…): the reason comes from main, plain text. */
function DeniedNote({ toolUseId, toolName, reason }: { toolUseId: string; toolName: string; reason: string }) {
  const t = useT()
  const text = t.claude.timelineParts.blocked(deniedToolLabel(toolName), reason)
  return (
    <div className="claude-denied" role="note" data-denied-tool={toolUseId} title={text}>
      <Icon name="shield" plain />
      <span className="claude-denied-text">{text}</span>
    </div>
  )
}

/** Output of a local CLI command (`/cost`, `/context`…): plain mono text, collapsed when long. */
const COMMAND_OUTPUT_LINES = 12

function CommandOutput({ text, timestamp }: { text: string; timestamp: number }) {
  const [open, setOpen] = useState(false)
  const t = useT()
  const lines = text.split('\n')
  const long = lines.length > COMMAND_OUTPUT_LINES
  const shown = long && !open ? lines.slice(0, COMMAND_OUTPUT_LINES).join('\n') : text
  return (
    <div className="claude-command-output" data-command-output>
      <pre>{shown}</pre>
      <div className="claude-command-foot">
        {long && (
          <Button size="xs" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? t.claude.timelineParts.showLess : t.claude.timelineParts.showAll(lines.length)}
          </Button>
        )}
        <MessageTime timestamp={timestamp} />
      </div>
    </div>
  )
}
