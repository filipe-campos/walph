import { formatFullDate, formatTime } from '../../../lib/claudeTime'

/**
 * `HH:mm` time of the message; the `title` carries the full date. Without a time in the transcript, nothing is shown.
 */
export function MessageTime({ timestamp }: { timestamp?: number | undefined }) {
  if (!timestamp) return null
  return (
    <time className="claude-msg-time" dateTime={new Date(timestamp).toISOString()} title={formatFullDate(timestamp)}>
      {formatTime(timestamp)}
    </time>
  )
}
