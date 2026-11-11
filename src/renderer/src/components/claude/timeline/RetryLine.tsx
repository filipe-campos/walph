import type { ClaudeRetry } from '../../../lib/claudeConversation'
import { retryCountdown, retryLead } from '../../../lib/claudeRetry'
import { Icon } from '../../common/Icon'
import { useNow } from '../../common/useNow'

/** Temporary API failure: cause + countdown. The clock (1 s) only ticks with the conversation in view. */
export function RetryLine({ retry, active }: { retry: ClaudeRetry; active: boolean }) {
  // The parent uses `key={retry.timestamp}`: each new attempt starts with the current clock.
  const now = useNow(1000, active, retry.timestamp + retry.delayMs)
  return (
    <div className="claude-retry" data-retry-attempt={retry.attempt}>
      <Icon name="restart" plain />
      {/* Only the cause and the attempt are announced; the countdown changes every second and would keep repeating. */}
      <span role="status">{retryLead(retry)}</span>
      <span aria-hidden>{retryCountdown(retry, now)}</span>
    </div>
  )
}
