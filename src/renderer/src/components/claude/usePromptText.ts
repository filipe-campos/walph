import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getDraft, saveDraftText } from '../../claudeDrafts'
import { registerPrompt } from '../../claudePromptBridge'
import { HISTORY_IDLE, insertAtCaret, type HistoryNav } from '../../lib/claudePrompt'

/**
 * Prompt box text: per-conversation draft, cursor, history (↑/↓) and the bridge for commands outside React.
 * `setText` is the only path that writes programmatically (history, suggestion, menus, external bridge).
 */
export function usePromptText(conversationId: string) {
  const [text, setTextState] = useState(() => getDraft(conversationId).text)
  const [caret, setCaretState] = useState(text.length)
  // Cursor already published to the state: commit + onSelect of the same input do not render twice.
  const caretRef = useRef(text.length)
  const setCaret = useCallback((next: number) => {
    if (caretRef.current === next) return
    caretRef.current = next
    setCaretState(next)
  }, [])
  const ref = useRef<HTMLTextAreaElement>(null)
  const nav = useRef<HistoryNav>(HISTORY_IDLE)
  const pendingCaret = useRef<number | null>(null)
  const textRef = useRef(text)
  // The id changes when a dormant tab wakes up (or on /clear) while the send is still in flight: what runs AFTER it
  // (clearing the draft) must use the current id, not the one from the click.
  const idRef = useRef(conversationId)
  useLayoutEffect(() => {
    idRef.current = conversationId
  }, [conversationId])

  const commit = useCallback(
    (next: string, nextCaret: number) => {
      textRef.current = next
      setTextState(next)
      setCaret(nextCaret)
      saveDraftText(idRef.current, next)
    },
    [setCaret]
  )

  /**
   * Replaces the text programmatically; with `nextCaret` it places the cursor (otherwise the browser moves it to the
   * end).
   */
  const writeText = useCallback(
    (next: string, nextCaret?: number) => {
      commit(next, nextCaret ?? next.length)
      pendingCaret.current = nextCaret ?? null
    },
    [commit]
  )
  const setText = writeText

  // Bridge for commands outside React (insert a reference, focus, give back a checkpoint message).
  useEffect(
    () =>
      registerPrompt(conversationId, {
        focus: () =>
          // The panel may be leaving `display: none` in this same tick.
          requestAnimationFrame(() => {
            ref.current?.focus()
          }),
        insert: (value) => {
          const el = ref.current
          const next = insertAtCaret(textRef.current, value, el?.selectionStart, el?.selectionEnd)
          setText(next.text, next.caret)
        },
        setText: (value) => setText(value),
        hasFocus: () => document.activeElement === ref.current
      }),
    [conversationId, setText]
  )

  // Cursor after a programmatic insertion (React only updates the value).
  useLayoutEffect(() => {
    const el = ref.current
    if (el && pendingCaret.current !== null) {
      el.setSelectionRange(pendingCaret.current, pendingCaret.current)
      pendingCaret.current = null
    }
  }, [text])

  return { text, caret, ref, nav, textRef, idRef, commit, writeText, setText, setCaret }
}
