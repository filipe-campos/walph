export type ToastTone = 'done' | 'info' | 'attention' | 'error'

interface ToastAction {
  label: string
  /** Running the action also dismisses the toast. */
  onClick: () => void
}

export interface Toast {
  id: number
  /** Optional key: a new toast with the same key replaces the previous one; it also serves to remove it from code. */
  key?: string
  tone: ToastTone
  title: string
  description?: string | undefined
  actions?: ToastAction[]
  /** ms until it goes away by itself (time bar that pauses on hover). Without `duration` the toast stays until
   * dismissed.
   */
  duration?: number | undefined
  /** Progress bar (clone): 0–100, or `null` = indeterminate. Without the field, no bar. */
  progress?: number | null
  /** Source workspace (notice from a session of another workspace in the window): becomes a card inside the toast. */
  origin?: { name: string; branch: string | null; root: string | null }
  /** Notice originated by the AI (Claude): only it gets the `neon`/`neon-live` light; generic notices do not. */
  ai?: boolean
  /** Leaving with animation (set by `leaveToast`): a `showToast` with the same `key` cannot reuse it. */
  leaving?: boolean
}

export interface ToastsState {
  toasts: Toast[]
}
