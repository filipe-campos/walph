import { useMemo, useState } from 'react'
import { resumeSession } from '../../claudeLifecycle'
import { loadSessions } from '../../claudeSessionMeta'
import { useT } from '../../i18n'
import { Icon } from '../common/Icon'
import { useAsync } from '../common/useAsync'
import { IconButton } from '../common/IconButton'
import { favoritesFirst } from '../../lib/claudeSessions'
import { relativeTime } from '../../lib/relativeTime'

/** Previous conversations of the folder (the CLI ones too), with search by title; clicking resumes the conversation. */
export function SessionHistory({ onClose }: { onClose: () => void }) {
  const t = useT()
  const m = t.claude.history
  const sessions = useAsync(loadSessions, []).value ?? null
  const [query, setQuery] = useState('')

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    // Favorites first (recency order applies within each group); `title` already comes resolved from main.
    return favoritesFirst((sessions ?? []).filter((s) => !q || s.title.toLowerCase().includes(q)))
  }, [sessions, query])

  return (
    <div className="claude-history" role="dialog" aria-label={m.title}>
      <div className="claude-history-head">
        <input
          autoFocus
          value={query}
          placeholder={m.searchPlaceholder}
          aria-label={m.search}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
        />
        <IconButton icon="codicon-close" label={m.close} onClick={onClose} />
      </div>
      <div className="claude-history-list">
        {sessions === null ? (
          <div className="empty-line muted">{t.common.loading}</div>
        ) : shown.length === 0 ? (
          <div className="empty-line muted">{sessions.length === 0 ? m.empty : m.noMatch}</div>
        ) : (
          shown.map((s) => (
            <button
              key={s.sessionId}
              className="claude-history-item"
              data-favorite={s.favorite}
              onClick={() => {
                onClose()
                void resumeSession(s.sessionId)
              }}
            >
              <span className="claude-history-title ellipsis">
                {s.favorite && <Icon name="star" className="claude-history-star" role="img" aria-label={m.favorite} />}
                {s.title || m.untitled}
              </span>
              <span className="claude-history-meta muted">
                {relativeTime(s.lastModified)}
                {s.gitBranch ? ` · ${s.gitBranch}` : ''}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
