import { useRef } from 'react'
import { selectGitBusy, useStore } from '../../store'
import { commitChanges, setCommitAmend, setCommitMessage } from '../../gitActions'
import { useT } from '../../i18n'
import { useRequest } from '../common/useRequest'
import { Button } from '../common/Button'

const mod = window.api.platform === 'darwin' ? '⌘' : 'Ctrl+'

/** Message box + Amend + commit button. It is its own component: typing does not re-render the whole view. */
export function CommitBox() {
  const t = useT()
  const message = useStore((s) => s.commitMessage)
  const amend = useStore((s) => s.commitAmend)
  const busy = useStore(selectGitBusy)
  const branch = useStore((s) => s.git?.branch ?? '')
  const stagedCount = useStore((s) => s.git?.files.filter((f) => f.index !== ' ' && f.index !== '?').length ?? 0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useRequest('commitFocus', () => textareaRef.current?.focus())

  const canCommit = !busy && !!message.trim() && (amend || stagedCount > 0)
  const disabledReason = !message.trim()
    ? t.git.commitBox.noMessage
    : !amend && stagedCount === 0
      ? t.git.commitBox.nothingStaged
      : undefined

  return (
    <div className="commit-box">
      <textarea
        ref={textareaRef}
        placeholder={amend ? t.git.commitBox.amendPlaceholder(mod, branch) : t.git.commitBox.placeholder(mod, branch)}
        value={message}
        rows={3}
        onChange={(e) => setCommitMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            if (canCommit) void commitChanges()
          }
        }}
      />
      <label className="commit-amend" title={t.git.commitBox.amendTitle}>
        <input type="checkbox" checked={amend} disabled={busy} onChange={(e) => setCommitAmend(e.target.checked)} />
        {t.git.commitBox.amendLabel}
      </label>
      <Button
        variant="primary"
        data-testid="commit-submit"
        disabled={!canCommit}
        title={disabledReason}
        onClick={() => void commitChanges()}
      >
        <i className="codicon codicon-check" /> {amend ? t.git.commitBox.amend : t.git.commitBox.commit}
      </Button>
    </div>
  )
}
