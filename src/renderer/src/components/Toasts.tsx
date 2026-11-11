import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store'
import type { Toast, ToastTone } from '../types/toasts'
import { Button } from './common/Button'
import { Icon } from './common/Icon'
import { dismissToast, leaveToast } from '../toasts'
import { useT } from '../i18n'

function ToneIcon({ tone }: { tone: ToastTone }) {
  if (tone === 'done') return <Icon name="check" />
  if (tone === 'attention') return <Icon name="alert" />
  if (tone === 'error') return <Icon name="error" />
  return <Icon name="spark" />
}

// Clock of each toast, outside the component: opening/closing a modal moves the portal stack and remounts the items.
// The
// new item renders BEFORE the old one's cleanup, so the remainder is computed on the spot from `since` (counting from).
const clocks = new WeakMap<Toast, { remaining: number; since: number | null }>()

function remainingOf(toast: Toast): number {
  const clock = clocks.get(toast)
  if (!clock) return toast.duration ?? 0
  return Math.max(0, clock.remaining - (clock.since === null ? 0 : Date.now() - clock.since))
}

/** A toast. Time runs in JS (not on `animationend`) so reduced motion does not close the notice right away. */
function ToastItem({ toast }: { toast: Toast }) {
  const t = useT()
  const { id, tone, duration } = toast
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  // Animated exit (design system: slides 12px to the right): the toast only leaves the store after the animation. The
  // state lives in the store so a `showToast` with the same `key` knows this notice is dying.
  const leaving = !!toast.leaving
  const paused = hovered || focused
  const [elapsedAtMount] = useState(() => (duration ? duration - remainingOf(toast) : 0))

  const dismiss = useCallback(() => leaveToast(id), [id])

  useEffect(() => {
    if (!leaving) return
    // `animationend` is the normal path; the timer covers a hidden view/no animation so the notice never gets stuck.
    const fallback = setTimeout(() => dismissToast(id), 450)
    return () => clearTimeout(fallback)
  }, [leaving, id])

  useEffect(() => {
    if (!duration || paused || leaving) return
    const clock = clocks.get(toast) ?? { remaining: duration, since: null }
    clocks.set(toast, clock)
    clock.since ??= Date.now()
    const timer = setTimeout(dismiss, remainingOf(toast))
    return () => {
      clearTimeout(timer)
      clock.remaining = remainingOf(toast)
      clock.since = null
    }
  }, [duration, paused, leaving, toast, dismiss])

  const alert = tone === 'attention' || tone === 'error'
  return (
    <div
      className={`toast-stack toast-stack-${tone}${leaving ? ' toast-leaving' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false)
      }}
      onAnimationEnd={(e) => {
        if (leaving && e.target === e.currentTarget) dismissToast(id)
      }}
    >
      {toast.origin && (
        // Card of the source workspace, behind the toast (only the top strip shows): name, branch and path in the
        // tooltip.
        <div className="toast-origin" title={toast.origin.root ?? toast.origin.name}>
          <Icon name="layers" />
          <span className="toast-origin-name">{toast.origin.name}</span>
          {toast.origin.branch && (
            <span className="toast-origin-branch">
              <Icon name="branch" />
              <span className="ellipsis">{toast.origin.branch}</span>
            </span>
          )}
        </div>
      )}
      <div
        className={`toast toast-${tone}${toast.origin ? ' toast-has-origin' : ''}${
          tone === 'done' || (tone === 'info' && toast.ai) ? ' neon' : ''
        }${tone === 'info' && toast.ai ? ' neon-live' : ''}`}
        role={alert ? 'alert' : undefined}
        data-tone={tone}
        data-key={toast.key}
      >
        <span className="toast-icon" aria-hidden>
          <ToneIcon tone={tone} />
        </span>
        <div className="toast-body">
          <div className="toast-title">{toast.title}</div>
          {toast.description && (
            // Toast with progress: each text update is not re-announced (the region is `polite`); the screen reader
            // reads the bar's `aria-valuetext` on demand and the end comes as another notice.
            <div className="toast-description" aria-live={toast.progress !== undefined ? 'off' : undefined}>
              {toast.description}
            </div>
          )}
          {toast.progress !== undefined && (
            // Cloning: a determinate bar (0–100) or, without a percentage, a running segment (indeterminate).
            <div
              className={`toast-progress${toast.progress === null ? ' indeterminate' : ''}`}
              role="progressbar"
              aria-label={t.app.toasts.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={toast.progress ?? undefined}
              aria-valuetext={toast.description}
            >
              <span style={toast.progress === null ? undefined : { transform: `scaleX(${toast.progress / 100})` }} />
            </div>
          )}
          {toast.actions && toast.actions.length > 0 && (
            <div className="toast-actions">
              {toast.actions.map((action, i) => {
                const run = (): void => {
                  leaveToast(id)
                  action.onClick()
                }
                return i === 0 ? (
                  <Button key={action.label} variant="primary" className="toast-action" onClick={run}>
                    {action.label}
                  </Button>
                ) : (
                  <button key={action.label} className="toast-action toast-action-quiet" onClick={run}>
                    {action.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        {/* A toast with progress only ends by itself or by "Cancel": closing would hide the only way to cancel. */}
        {toast.progress === undefined && (
          <button className="toast-close" title={t.common.close} aria-label={t.app.toasts.dismiss} onClick={dismiss}>
            <Icon name="close" />
          </button>
        )}
        {duration ? (
          <span
            className={`toast-time${paused ? ' paused' : ''}`}
            style={{ '--toast-duration': `${duration}ms`, animationDelay: `-${elapsedAtMount}ms` } as CSSProperties}
            aria-hidden
          />
        ) : null}
      </div>
    </div>
  )
}

/** Toast stack in the bottom right corner of the editor area (design system Toast). */
export function Toasts() {
  const t = useT()
  const toasts = useStore((s) => s.toasts)
  // With a modal open the app (#root) is inert: the stack goes to `body`, above the modal, so the notices (e.g. a write
  // error) stay visible and clickable.
  // The Containers screen hides `.main` (where the stack lives): without the portal the action errors would be
  // invisible.
  const overModal = useStore(
    (s) =>
      s.overlay?.kind === 'settings' ||
      s.overlay?.kind === 'mcp' ||
      s.overlay?.kind === 'usage' ||
      s.screen === 'containers'
  )
  // Always mounted: screen readers only announce what enters a live region that already existed.
  const stack = (
    <div
      className={`toasts${overModal ? ' over-modal' : ''}`}
      role="region"
      aria-label={t.app.toasts.region}
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  )
  return overModal ? createPortal(stack, document.body) : stack
}
