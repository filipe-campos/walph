import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../../store'
import { useT } from '../../i18n'
import { evaluateInConsole } from '../../debugActions'
import { displayText, stepHistory, type ConsoleEntry } from '../../lib/debugConsole'
import { ValueRow, ValueTree } from './ValueTree'

const ConsoleLine = memo(function ConsoleLine({ entry }: { entry: ConsoleEntry }) {
  const kind = entry.kind === 'output' ? `output ${entry.category ?? 'console'}` : entry.kind
  if (entry.kind === 'result' && (entry.variablesReference ?? 0) > 0) {
    return (
      <div className="debug-console-line result">
        <ValueTree label={displayText(entry)}>
          <ValueRow
            nodeKey={`console:${entry.id}`}
            name={displayText(entry)}
            reference={entry.variablesReference ?? 0}
            depth={0}
          />
        </ValueTree>
      </div>
    )
  }
  return <div className={`debug-console-line ${kind}`}>{displayText(entry)}</div>
})

/** Debug Console (bottom panel): session output, evaluated expressions and the evaluation field. */
export function DebugConsole() {
  const t = useT()
  const m = t.debugUi.console
  const entries = useStore((s) => s.debugConsole)
  const canEvaluate = useStore((s) => s.debugFocus !== null)
  const visible = useStore((s) => s.terminalVisible && s.panelView === 'debugConsole')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Follows the output while the user is at the end; scrolling up suspends following.
  const stick = useRef(true)
  const history = useRef<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (visible && el && stick.current) el.scrollTop = el.scrollHeight
  }, [entries, visible])

  useEffect(() => {
    if (visible) inputRef.current?.focus()
  }, [visible])

  const onScroll = (): void => {
    const el = scrollRef.current
    if (visible && el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8
  }

  return (
    <div className="debug-console">
      <div
        className="debug-console-output"
        ref={scrollRef}
        tabIndex={0}
        role="log"
        aria-label={m.label}
        onScroll={onScroll}
      >
        {entries.length === 0 ? (
          <div className="output-empty">{m.empty}</div>
        ) : (
          entries.map((e) => <ConsoleLine key={e.id} entry={e} />)
        )}
      </div>
      <div className="debug-console-input">
        <span className="codicon codicon-chevron-right" aria-hidden />
        <input
          ref={inputRef}
          aria-label={m.inputLabel}
          placeholder={canEvaluate ? m.placeholder : m.placeholderIdle}
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            const input = e.currentTarget
            if (e.key === 'Enter') {
              e.preventDefault()
              const text = input.value.trim()
              if (!text) return
              if (history.current.at(-1) !== text) history.current.push(text)
              setHistoryIndex(-1)
              input.value = ''
              stick.current = true
              void evaluateInConsole(text)
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              const step = stepHistory(history.current, historyIndex, e.key === 'ArrowUp' ? 'up' : 'down')
              if (!step) return
              e.preventDefault()
              setHistoryIndex(step.index)
              input.value = step.text
            }
          }}
        />
      </div>
    </div>
  )
}
