import type { ConfirmOptions } from '@shared/types'

const MAX_TEXT = 2000

/** Validates the `dialog:confirm` argument coming from the (untrusted) renderer. */
export function parseConfirmOptions(value: unknown): ConfirmOptions | null {
  if (typeof value !== 'object' || value === null) return null
  const { message, detail, confirmLabel, destructive } = value as Record<string, unknown>
  if (typeof message !== 'string' || !message.trim()) return null
  if (typeof confirmLabel !== 'string' || !confirmLabel.trim()) return null
  if (detail !== undefined && typeof detail !== 'string') return null
  return {
    message: message.slice(0, MAX_TEXT),
    detail: detail?.slice(0, MAX_TEXT),
    confirmLabel: confirmLabel.slice(0, 40),
    destructive: destructive === true
  }
}
