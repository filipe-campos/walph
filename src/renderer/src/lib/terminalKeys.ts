export type KeyInput = {
  key: string
  metaKey: boolean
  altKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
}

/**
 * macOS line editing shortcuts that xterm does not translate: they become the sequences the shell understands
 * (readline).
 */
const MAC_KEYS: Record<'meta' | 'alt', Record<string, string>> = {
  meta: {
    Backspace: '\x15',
    ArrowLeft: '\x01',
    ArrowRight: '\x05',
    Delete: '\x0b'
  },
  alt: {
    Backspace: '\x17',
    ArrowLeft: '\x1bb',
    ArrowRight: '\x1bf'
  }
}

/** Sequence to send to the pty for the shortcut, or `null` if it is not one (macOS only, exact modifiers). */
export function terminalKeySequence(e: KeyInput, platform: string): string | null {
  if (platform !== 'darwin' || e.ctrlKey || e.shiftKey) return null
  if (e.metaKey && !e.altKey) return MAC_KEYS.meta[e.key] ?? null
  if (e.altKey && !e.metaKey) return MAC_KEYS.alt[e.key] ?? null
  return null
}
