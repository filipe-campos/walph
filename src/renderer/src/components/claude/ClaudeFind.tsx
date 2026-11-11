import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { focusPrompt } from '../../claudePromptBridge'
import { findTextMatches } from '../../lib/textMatches'
import { useT } from '../../i18n'
import { IconButton } from '../common/IconButton'
import { Toggle } from '../common/Toggle'
import { useFocusTarget } from '../common/useFocusTarget'
import { closeClaudeFind } from '../../layoutActions'

const ALL = 'claude-find'
const CURRENT = 'claude-find-current'

interface HighlightRegistry {
  set(name: string, value: unknown): void
  delete(name: string): void
}
type HighlightCtor = new (...ranges: Range[]) => { priority: number }

/**
 * `CSS.highlights` does not exist in jsdom (nor in old Chromium): without it the search counts and navigates, it just
 * does not paint.
 */
function highlightApi(): { registry: HighlightRegistry; Highlight: HighlightCtor } | null {
  const registry =
    typeof CSS !== 'undefined' ? (CSS as unknown as { highlights?: HighlightRegistry }).highlights : undefined
  const Highlight = (globalThis as unknown as { Highlight?: HighlightCtor }).Highlight
  return registry && Highlight ? { registry, Highlight } : null
}

function clearHighlights(): void {
  const api = highlightApi()
  api?.registry.delete(ALL)
  api?.registry.delete(CURRENT)
}

function paint(ranges: Range[], current: number): void {
  const api = highlightApi()
  if (!api) return
  if (ranges.length === 0) return clearHighlights()
  api.registry.set(ALL, new api.Highlight(...ranges))
  const cur = ranges[current]
  if (!cur) return api.registry.delete(CURRENT)
  const h = new api.Highlight(cur)
  h.priority = 1
  api.registry.set(CURRENT, h)
}

/** Visible text nodes of the timeline, in document order (the search widget itself stays out of the list). */
function textNodes(root: Element): Text[] {
  const out: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const parent = n.parentElement
      if (!parent || parent.closest('[hidden], script, style, .claude-find')) return NodeFilter.FILTER_REJECT
      return n.nodeValue ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    }
  })
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text)
  return out
}

/**
 * Text search in the session (⌘F with focus on the Claude panel). Paints with the CSS Custom Highlight API over the
 * text
 * nodes of `.claude-timeline` (without touching React's DOM) and recomputes when the timeline changes (streaming). Only
 * rendered text counts: collapsed tool outputs are left out.
 */
export function ClaudeFind({ conversationId, active }: { conversationId: string; active: boolean }) {
  const focusRequests = useFocusTarget(`claudeFind:${conversationId}`)
  const barRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const t = useT()
  const m = t.claude.find
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [result, setResult] = useState({ index: 0, count: 0 })
  const ranges = useRef<Range[]>([])
  const index = useRef(0)

  // Switching tabs hides the session: the search closes with it (the highlights are global to the document).
  useEffect(() => {
    if (!active) {
      clearHighlights()
      closeClaudeFind()
    }
  }, [active])

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [focusRequests])

  const timeline = useCallback(
    () => barRef.current?.parentElement?.querySelector<HTMLElement>('.claude-timeline') ?? null,
    []
  )

  const reveal = useCallback((): void => {
    const range = ranges.current[index.current]
    const el = range?.startContainer.parentElement
    // `center`: the result is not stuck to the edges nor under the bar; scrolling releases the timeline's "stick to the
    // end".
    el?.scrollIntoView({ block: 'center' })
  }, [])

  // `jump`: the user asked for a match (typed, Enter), so scroll to it; recomputing due to streaming only repaints.
  const recompute = useCallback(
    (jump: boolean): void => {
      const root = timeline()
      const nodes = root && query !== '' ? textNodes(root) : []
      const matches = findTextMatches(
        nodes.map((n) => n.data),
        query,
        caseSensitive
      )
      ranges.current = matches.flatMap((m) => {
        const from = nodes[m.start.segment]
        const to = nodes[m.end.segment]
        if (!from || !to) return []
        const r = document.createRange()
        r.setStart(from, m.start.offset)
        r.setEnd(to, m.end.offset)
        return [r]
      })
      index.current = jump ? 0 : Math.min(index.current, Math.max(ranges.current.length - 1, 0))
      paint(ranges.current, index.current)
      setResult((prev) =>
        prev.count === ranges.current.length && prev.index === index.current
          ? prev
          : { index: index.current, count: ranges.current.length }
      )
      if (jump) reveal()
    },
    [query, caseSensitive, timeline, reveal]
  )

  // Query/option changed: new search from the start. Outside onChange so it also applies to "Aa".
  useEffect(() => {
    if (!active) return
    recompute(true)
  }, [recompute, active])

  // Streaming and new messages: recompute with a throttle (the text grows every frame).
  useEffect(() => {
    const root = timeline()
    if (!root || !active || typeof MutationObserver === 'undefined') return
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new MutationObserver(() => {
      // Throttle with a trailing edge: during continuous streaming the highlight follows every 150 ms instead of
      // waiting for silence.
      if (timer !== undefined) return
      timer = setTimeout(() => {
        timer = undefined
        recompute(false)
      }, 150)
    })
    observer.observe(root, { childList: true, subtree: true, characterData: true })
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [recompute, timeline, active])

  useEffect(
    () => () => {
      clearHighlights()
      ranges.current = []
    },
    []
  )

  const step = (dir: 1 | -1): void => {
    const count = ranges.current.length
    if (count === 0) return
    index.current = (index.current + dir + count) % count
    paint(ranges.current, index.current)
    setResult({ index: index.current, count })
    reveal()
  }

  const close = (): void => {
    clearHighlights()
    closeClaudeFind()
    focusPrompt()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Escape') {
      // Without this Esc would reach the panel and interrupt the run.
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Enter' && e.target === inputRef.current) {
      e.preventDefault()
      step(e.shiftKey ? -1 : 1)
    }
  }

  if (!active) return null

  const none = query !== '' && result.count === 0
  let status = ''
  if (query !== '') status = none ? m.noResults : m.position(result.index + 1, result.count)

  return (
    <div ref={barRef} className="claude-find" role="search" onKeyDown={onKeyDown}>
      <input
        ref={inputRef}
        className="claude-find-input"
        placeholder={m.placeholder}
        aria-label={m.label}
        spellCheck={false}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <Toggle
        active={caseSensitive}
        label={m.matchCase}
        icon="codicon-case-sensitive"
        onClick={() => setCaseSensitive(!caseSensitive)}
      />
      <span className={`claude-find-status${none ? ' none' : ''}`} aria-live="polite">
        {status}
      </span>
      <IconButton icon="codicon-arrow-up" label={m.previous} disabled={result.count === 0} onClick={() => step(-1)} />
      <IconButton icon="codicon-arrow-down" label={m.next} disabled={result.count === 0} onClick={() => step(1)} />
      <IconButton icon="codicon-close" label={m.close} onClick={close} />
    </div>
  )
}
