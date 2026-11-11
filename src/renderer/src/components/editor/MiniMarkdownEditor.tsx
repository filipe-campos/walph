import { useEffect, useRef } from 'react'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder as placeholderExtension } from '@codemirror/view'
import { loadLanguage } from '../../lib/language'
import { selectThemeName, useStore } from '../../store'
import { findTheme } from '../../themes'
import { walphEditorTheme } from '../../themes/editorTheme'

/**
 * Small Markdown editor with its own `EditorView` (created on mount, destroyed on unmount), with the app theme, line
 * wrapping and focus on open. ⌘/Ctrl+Enter calls `onSubmit`; Esc is not handled here (the container decides, e.g.
 * `Modal`).
 */
export function MiniMarkdownEditor({
  value,
  onChange,
  onSubmit,
  placeholder,
  label,
  className
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder: string
  label: string
  className?: string
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const callbacks = useRef({ onChange, onSubmit })
  const themeKind = useStore((s) => findTheme(selectThemeName(s)).kind)
  const themeSlot = useRef(new Compartment())
  const languageSlot = useRef(new Compartment())
  const initial = useRef({ value, placeholder, label, themeKind })

  useEffect(() => {
    callbacks.current = { onChange, onSubmit }
  })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const { value: doc, placeholder: hint, label: aria, themeKind: kind } = initial.current
    const theme = themeSlot.current
    const language = languageSlot.current
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc,
        extensions: [
          keymap.of([
            {
              key: 'Mod-Enter',
              run: () => {
                callbacks.current.onSubmit()
                return true
              }
            },
            ...defaultKeymap,
            ...historyKeymap
          ]),
          history(),
          EditorView.lineWrapping,
          placeholderExtension(hint),
          EditorView.contentAttributes.of({ 'aria-label': aria, 'aria-multiline': 'true' }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callbacks.current.onChange(update.state.doc.toString())
          }),
          theme.of(walphEditorTheme(kind)),
          language.of([])
        ]
      })
    })
    viewRef.current = view
    let disposed = false
    void loadLanguage('args.md').then(
      (support) => {
        if (!disposed && support) view.dispatch({ effects: language.reconfigure(support) })
      },
      () => {}
    )
    // After the initial focus of `Modal`, which runs in the same effects flush.
    const frame = requestAnimationFrame(() => view.focus())
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: themeSlot.current.reconfigure(walphEditorTheme(themeKind)) })
  }, [themeKind])

  return <div ref={hostRef} className={['mini-editor', className].filter(Boolean).join(' ')} />
}
