import { useEffect, useState } from 'react'
import type { ClaudeRateLimit } from '@shared/types'
import { formatRateLimit } from '../../lib/claudeRateLimit'
import { useT } from '../../i18n'
import { Icon } from '../common/Icon'

/**
 * Compact notice of the subscription usage limit, above the prompt box. The parent uses the limit as `key`: the
 * "renews at…" clock is read once per change (no `Date.now()` in render).
 */
export function RateLimitBanner({ limit }: { limit: ClaudeRateLimit }) {
  useT()
  const [now, setNow] = useState(() => Date.now())
  // A single timer until whatever changes the text: the renewal time or midnight ("tomorrow" becomes "at…").
  useEffect(() => {
    const midnight = new Date(now)
    midnight.setHours(24, 0, 0, 0)
    const next = Math.min(
      midnight.getTime(),
      limit.resetsAt !== null && limit.resetsAt > now ? limit.resetsAt : Infinity
    )
    const timer = setTimeout(() => setNow(Date.now()), Math.min(next - now + 1000, 2 ** 31 - 1))
    return () => clearTimeout(timer)
  }, [now, limit.resetsAt])
  const view = formatRateLimit(limit, now)
  if (!view) return null
  return (
    <div
      className={`claude-ratelimit ${view.tone}`}
      role={view.tone === 'error' ? 'alert' : 'status'}
      data-rate-limit={limit.status}
      data-rate-window={limit.window}
    >
      <Icon name={view.tone === 'error' ? 'error' : 'alert'} plain />
      <span className="claude-ratelimit-text">{view.text}</span>
    </div>
  )
}
