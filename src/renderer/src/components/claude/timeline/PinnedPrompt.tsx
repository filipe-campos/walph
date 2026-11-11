import { useEffect, useRef, useState } from 'react'
import { focusPrompt } from '../../../claudePromptBridge'
import { useT } from '../../../i18n'
import { IconButton } from '../../common/IconButton'

/**
 * Your last message stays pinned to the top while the response scrolls. A sentinel at its top tells
 * (IntersectionObserver)
 * when it left the top: then a compact copy (up to 3 lines) shows in a zero-height `sticky` strip, before it.
 * Clicking the copy scrolls to the message. None of this goes through the store.
 */
// The message in the flow never changes height: shrinking it when pinned changed the scroll, the sentinel came back
// into
// view, it unpinned and grew again, and the cycle made the long message flicker.
export function PinnedPrompt({
  scrollRef,
  pinned,
  compact,
  children
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>
  pinned: boolean
  /** Content of the copy pinned to the top. */
  compact: React.ReactNode
  children: React.ReactNode
}) {
  const sentinel = useRef<HTMLDivElement>(null)
  const t = useT()
  const [observed, setObserved] = useState(false)

  useEffect(() => {
    const target = sentinel.current
    const root = scrollRef.current
    if (!pinned || !target || !root || typeof IntersectionObserver === 'undefined') return
    // A hidden panel (zero height) does not count as "pinned". The IntersectionObserver only notifies when the
    // intersection changes: a direct jump from "below" to "above" the area gives no notice, so scrolling also
    // re-evaluates.
    const update = (): void => {
      const area = root.getBoundingClientRect()
      setObserved(area.height > 0 && target.getBoundingClientRect().top < area.top)
    }
    const observer = new IntersectionObserver(update, { root })
    observer.observe(target)
    root.addEventListener('scroll', update, { passive: true })
    return () => {
      observer.disconnect()
      root.removeEventListener('scroll', update)
    }
  }, [scrollRef, pinned])

  // No longer the last message: the observed value no longer holds.
  const stuck = pinned && observed

  // Scrolls the scroller to the message; no animation with reduced motion.
  const scrollToOrigin = (): void => {
    const root = scrollRef.current
    const target = sentinel.current
    if (!root || !target) return
    const top = root.scrollTop + target.getBoundingClientRect().top - root.getBoundingClientRect().top
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    root.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' })
  }

  return (
    <>
      {pinned ? (
        <div className="claude-pinned-bar">
          {stuck && (
            <div
              className="claude-pinned-overlay"
              data-testid="claude-pinned-overlay"
              // A mouse click on the bubble also scrolls; the keyboard/screen reader uses the dedicated button (without
              // nesting buttons inside a `role=button`).
              onClick={(e) => {
                if (!(e.target as HTMLElement).closest('button')) scrollToOrigin()
              }}
            >
              <IconButton
                className="claude-pinned-goto"
                label={t.claude.timelineParts.scrollToMessage}
                onClick={() => {
                  scrollToOrigin()
                  // The button disappears when the message unpins: focus goes to the prompt instead of getting lost.
                  focusPrompt()
                }}
                glyph="chevron"
              />
              <div className="claude-user" aria-hidden>
                {compact}
              </div>
            </div>
          )}
        </div>
      ) : null}
      <div className={`claude-pinned-prompt${pinned ? ' pinned' : ''}`} data-stuck={stuck}>
        {pinned ? <div className="claude-pinned-sentinel" ref={sentinel} aria-hidden /> : null}
        {children}
      </div>
    </>
  )
}
