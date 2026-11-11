/* eslint-disable no-control-regex */
// CSI (colors, cursor) and OSC (hyperlinks, window title).
const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g
/* eslint-enable no-control-regex */

// C0/C1 controls plus the Unicode line/paragraph separators, which also break a "single line".
const CONTROL_CLASS = '[\\p{Cc}\\u2028\\u2029]'
const CONTROL = new RegExp(CONTROL_CLASS, 'u')
const CONTROL_RUN = new RegExp(`${CONTROL_CLASS}+`, 'gu')
const CONTROL_EXCEPT_LAYOUT = new RegExp(`(?![\\t\\n])${CONTROL_CLASS}`, 'gu')

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '')
}

export function hasControl(text: string): boolean {
  return CONTROL.test(text)
}

/**
 * Removes control characters. With `keepNewlines`, `\r\n` and `\r` become `\n` and `\n` and `\t` are kept
 * (multi-line text); without it, no control character is left.
 */
export function stripControl(text: string, { keepNewlines = false }: { keepNewlines?: boolean } = {}): string {
  if (!keepNewlines) return text.replace(CONTROL_RUN, '')
  return text.replace(/\r\n?/g, '\n').replace(CONTROL_EXCEPT_LAYOUT, '')
}

/** Each run of control characters becomes a single space (does not trim or merge the neighbouring spaces). */
export function flattenControl(text: string): string {
  return text.replace(CONTROL_RUN, ' ')
}
