import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { selectThemeName, useStore } from '../store'
import { errorMessage } from '../lib/errors'
import { findTheme } from '../themes'
import { searchDecorations } from '../lib/terminalSearch'
import { IconButton } from './common/IconButton'
import { useFocusTarget } from './common/useFocusTarget'
import { Toggle } from './common/Toggle'
import { searches } from './terminalRegistry'
import { notify } from '../toasts'
import { closeTerminalFind } from '../terminalActions'
import { useT } from '../i18n'

/** Search in a terminal buffer (⌘F with focus on it): Enter/Shift+Enter navigate, Esc closes and returns focus. */
export function TerminalFind({ id }: { id: string }) {
  const t = useT()
  const focusRequests = useFocusTarget(`terminalFind:${id}`)
  const themeName = useStore(selectThemeName)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [regex, setRegex] = useState(false)
  const [result, setResult] = useState<{ index: number; count: number } | null>(null)

  // Opening (and ⌘F again) takes focus to the field with the text selected.
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [focusRequests])

  useEffect(() => {
    const search = searches.get(id)
    if (!search) return
    const sub = search.onDidChangeResults(({ resultIndex, resultCount }) =>
      setResult({ index: resultIndex, count: resultCount })
    )
    return () => {
      sub.dispose()
      search.clearDecorations()
    }
  }, [id])

  // Invalid regex while typing (SyntaxError) is just "no results"; any other error is a defect and shows up.
  const fail = (err: unknown): void => {
    setResult({ index: -1, count: 0 })
    if (err instanceof SyntaxError) return
    console.error('Terminal search:', err)
    notify(t.terminal.find.failed(errorMessage(err)))
  }

  const run = (
    direction: 'next' | 'previous',
    text: string,
    flags: { caseSensitive: boolean; regex: boolean }
  ): void => {
    const search = searches.get(id)
    if (!search) return
    if (text === '') {
      search.clearDecorations()
      setResult(null)
      return
    }
    const options = {
      ...flags,
      // While typing, the search reuses the current match instead of jumping to the next one.
      incremental: direction === 'next',
      decorations: searchDecorations(findTheme(themeName).terminal)
    }
    try {
      const found = direction === 'next' ? search.findNext(text, options) : search.findPrevious(text, options)
      if (!found) setResult({ index: -1, count: 0 })
    } catch (err) {
      fail(err)
    }
  }

  const flags = { caseSensitive, regex }
  // Go to the previous/next match (Enter, Shift+Enter and the buttons): not "incremental", it must advance.
  const step = (direction: 'next' | 'previous'): void => {
    const search = searches.get(id)
    if (!search || query === '') return
    const options = { ...flags, decorations: searchDecorations(findTheme(themeName).terminal) }
    try {
      if (direction === 'next') search.findNext(query, options)
      else search.findPrevious(query, options)
    } catch (err) {
      fail(err)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Escape') {
      e.preventDefault()
      closeTerminalFind()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      step(e.shiftKey ? 'previous' : 'next')
    }
  }

  const none = query !== '' && result?.count === 0
  let status = ''
  if (query !== '' && result)
    status = none ? t.terminal.find.noResults : t.terminal.find.position(Math.max(result.index + 1, 1), result.count)

  return (
    <div className="terminal-find" role="search">
      <input
        ref={inputRef}
        className="terminal-find-input"
        placeholder={t.terminal.find.placeholder}
        aria-label={t.terminal.find.label}
        spellCheck={false}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          run('next', e.target.value, flags)
        }}
        onKeyDown={onKeyDown}
      />
      <Toggle
        active={caseSensitive}
        label={t.terminal.find.caseSensitive}
        icon="codicon-case-sensitive"
        onClick={() => {
          setCaseSensitive(!caseSensitive)
          run('next', query, { caseSensitive: !caseSensitive, regex })
        }}
      />
      <Toggle
        active={regex}
        label={t.terminal.find.regex}
        icon="codicon-regex"
        onClick={() => {
          setRegex(!regex)
          run('next', query, { caseSensitive, regex: !regex })
        }}
      />
      <span className={`terminal-find-status${none ? ' none' : ''}`} aria-live="polite">
        {status}
      </span>
      <IconButton
        icon="codicon-arrow-up"
        label={t.terminal.find.previous}
        disabled={query === ''}
        onClick={() => step('previous')}
      />
      <IconButton
        icon="codicon-arrow-down"
        label={t.terminal.find.next}
        disabled={query === ''}
        onClick={() => step('next')}
      />
      <IconButton icon="codicon-close" label={t.terminal.find.close} onClick={closeTerminalFind} />
    </div>
  )
}
