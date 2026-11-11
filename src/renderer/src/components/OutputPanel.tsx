import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { LspLogEntry } from '@shared/types'
import { useStore } from '../store'
import { appendLogs, formatLogTime, LOG_LIMIT, mergeLog } from '../lib/lspLog'
import { IconButton } from './common/IconButton'
import { loadLspLog, subscribeLog } from '../lspActions'
import { useT } from '../i18n'

/** Line with a sequential id given on receipt: a stable key even when the limit drops the oldest ones. */
type Line = LspLogEntry & { id: number }

const OutputLine = memo(function OutputLine({ entry }: { entry: Line }) {
  return (
    <div className={`output-line ${entry.level}`}>
      <span className="output-time">{formatLogTime(entry.time)}</span>{' '}
      <span className="output-server">[{entry.server}]</span> <span className="output-text">{entry.message}</span>
    </div>
  )
})

/** "Output" view: language server log (read-only). "Clear" only affects this view. */
export function OutputPanel() {
  const t = useT()
  const root = useStore((s) => s.root)
  const visible = useStore((s) => s.terminalVisible && s.panelView === 'output')
  const [entries, setEntries] = useState<Line[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const nextId = useRef(0)
  // Follows new lines while the user is at the end; scrolling up suspends following.
  const stick = useRef(true)
  // Hidden view: lines only accumulate (bounded) and enter the list when it appears.
  const visibleRef = useRef(visible)
  const flushRef = useRef<() => void>(() => {})

  useEffect(() => {
    let cancelled = false
    const number = (entry: LspLogEntry): Line => ({ ...entry, id: nextId.current++ })
    // Live lines arriving while the history loads go to `pending`; afterwards, to `batch` until the next
    // frame, so a log burst renders only once.
    let pending: Line[] | null = []
    let batch: Line[] = []
    let frame = 0
    const flush = (): void => {
      frame = 0
      if (batch.length === 0) return
      const lines = batch
      batch = []
      setEntries((prev) => appendLogs(prev, lines))
    }
    const off = subscribeLog((incoming) => {
      const lines = incoming.map(number)
      if (pending) return void pending.push(...lines)
      batch.push(...lines)
      // Only the latest matter: the list never exceeds the limit.
      if (batch.length > LOG_LIMIT) batch.splice(0, batch.length - LOG_LIMIT)
      if (visibleRef.current && !frame) frame = requestAnimationFrame(flush)
    })
    flushRef.current = flush
    void loadLspLog().then((history) => {
      if (cancelled) return
      setEntries(mergeLog(history.map(number), pending ?? []))
      pending = null
    })
    return () => {
      cancelled = true
      if (frame) cancelAnimationFrame(frame)
      flushRef.current = () => {}
      off()
    }
  }, [root])

  useEffect(() => {
    visibleRef.current = visible
    if (visible) flushRef.current()
  }, [visible])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (visible && el && stick.current) el.scrollTop = el.scrollHeight
  }, [entries, visible])

  useEffect(() => {
    if (visible) scrollRef.current?.focus()
  }, [visible])

  const onScroll = (): void => {
    const el = scrollRef.current
    if (visible && el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8
  }

  return (
    <>
      <div
        className="output-panel"
        ref={scrollRef}
        tabIndex={0}
        role="log"
        aria-label={t.lsp.panels.output}
        onScroll={onScroll}
      >
        {entries.length === 0 ? (
          <div className="output-empty">{t.lsp.panels.noOutput}</div>
        ) : (
          entries.map((e) => <OutputLine key={e.id} entry={e} />)
        )}
      </div>
      <div className="output-toolbar">
        <IconButton
          icon="codicon-clear-all"
          label={t.lsp.panels.clearOutput}
          disabled={entries.length === 0}
          onClick={() => {
            stick.current = true
            setEntries([])
          }}
        />
      </div>
    </>
  )
}
