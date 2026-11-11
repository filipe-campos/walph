import type { MouseEvent } from 'react'
import { useT } from '../../i18n'
import { Icon } from '../common/Icon'

/**
 * Running: "Stop" is always within mouse reach. With an empty field, it takes the place of send; with text, it shows
 * compact next to "Queue". Esc also interrupts.
 */
export function SendControls({
  working,
  hasContent,
  onSend,
  onStop
}: {
  working: boolean
  hasContent: boolean
  onSend: () => void
  onStop: (e: MouseEvent) => void
}) {
  const t = useT()
  const m = t.claude.sendControls
  if (working && !hasContent)
    return (
      <button
        key="stop"
        className="claude-send stop"
        title={m.stop}
        aria-label={m.interrupt}
        data-testid="claude-send"
        onClick={onStop}
      >
        <Icon name="stop" plain />
      </button>
    )
  return (
    <>
      {working && (
        <button
          key="stop-compact"
          className="claude-send stop compact"
          title={m.stop}
          aria-label={m.interrupt}
          data-testid="claude-stop"
          onClick={onStop}
        >
          <Icon name="stop" plain />
        </button>
      )}
      <button
        key="send"
        className="claude-send"
        title={working ? m.queueTitle : m.sendTitle}
        aria-label={working ? m.queue : m.send}
        data-testid="claude-send"
        disabled={!hasContent}
        onClick={onSend}
      >
        <Icon name="send" plain />
      </button>
    </>
  )
}
