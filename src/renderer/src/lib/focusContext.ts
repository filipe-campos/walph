// Focus contexts that main uses in the `when` clauses of the shortcuts (e.g. Ctrl+K belongs to the shell in the
// terminal).
import type { FocusContextKey } from '@shared/commands'

export type FocusContexts = Record<FocusContextKey, boolean>

/**
 * The focus was lost (element removed or fallen onto `body`): the browser does not fire `focusout` when the node
 * disappears.
 */
export function isFocusLost(el: Element | null): boolean {
  return !el || el === document.body || !el.isConnected
}

/**
 * Contexts of a focused element: inside xterm or its search = terminal; inside the file CodeMirror (`.code-editor`) =
 * editor; the diff MergeView does not count.
 */
export function contextsOf(el: Element | null): FocusContexts {
  return {
    // The terminal search field counts: ⌘F there refocuses the field, ⌘\ splits, and the shell shortcut does not leak.
    terminalFocus: !!el?.closest('.xterm, .terminal-find'),
    editorFocus: !!el?.closest('.code-editor .cm-editor'),
    // Claude panel: ⌘W closes the session and ⌃Tab switches session instead of acting on the editor.
    claudeFocus: !!el?.closest('.claude-panel'),
    // Markdown preview: ⇧⌘V on it goes back to the source file.
    markdownPreviewFocus: !!el?.closest('.markdown-preview'),
    // Explorer tree: ⌘C/⌘X/⌘V copy, cut and paste files instead of text (not in the inline rename, where they belong to
    // the text).
    explorerFocus: !!el?.closest('.tree') && !el.closest('.editing')
  }
}

/**
 * The opening of a conversation ended without any open (it failed): the focus that was on "Nova conversa"/suggestion
 * vanished.
 */
export function startEndedEmpty(
  prev: { starting: boolean; conversations: number },
  next: { starting: boolean; conversations: number }
): boolean {
  return prev.starting && !next.starting && next.conversations === 0
}
