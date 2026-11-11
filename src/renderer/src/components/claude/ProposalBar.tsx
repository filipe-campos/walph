import { useEffect, useRef, useState } from 'react'
import { acceptEdit, rejectEdit } from '../../claudePermissions'
import { useT } from '../../i18n'
import type { DiffTab } from '../../types/tabs'
import { Button } from '../common/Button'

/**
 * Accept / Reject of the edit proposed by Claude, in the diff header. Reject opens a field (inline: Electron
 * has no `window.prompt`) for the optional reason, which goes back to Claude.
 */
export function ProposalBar({
  proposal,
  isNewFile
}: {
  proposal: NonNullable<DiffTab['proposal']>
  isNewFile: boolean
}) {
  const t = useT()
  const m = t.claude.proposal
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const { conversationId, requestId } = proposal
  const barRef = useRef<HTMLDivElement>(null)

  // Opening the diff hides the editor with focus inside it: without a `focusout`, the `editorFocus` context would get
  // stuck.
  // Takes focus to the bar container (only if it was in the editor or loose): never to a button, otherwise an Enter or
  // Space the user was still typing would approve the write.
  useEffect(() => {
    const active = document.activeElement
    if (!active || active === document.body || active.closest('.code-editor')) barRef.current?.focus()
  }, [])

  if (rejecting) {
    return (
      <form
        className="claude-proposal"
        onSubmit={(e) => {
          e.preventDefault()
          rejectEdit(conversationId, requestId, reason)
        }}
      >
        <input
          autoFocus
          value={reason}
          placeholder={m.reasonPlaceholder}
          aria-label={m.reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setRejecting(false)
            }
          }}
        />
        <Button variant="primary" type="submit">
          {m.reject}
        </Button>
        <Button type="button" onClick={() => setRejecting(false)}>
          {t.common.cancel}
        </Button>
      </form>
    )
  }
  return (
    <div className="claude-proposal" ref={barRef} tabIndex={-1}>
      <span className="muted">{isNewFile ? m.newFile : m.edit}</span>
      <Button variant="primary" onClick={() => void acceptEdit(conversationId, requestId)}>
        {m.accept}
      </Button>
      <Button onClick={() => setRejecting(true)}>{m.rejectEllipsis}</Button>
    </div>
  )
}
