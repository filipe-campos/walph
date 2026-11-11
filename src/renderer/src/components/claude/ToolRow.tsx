import { memo, useMemo, useState } from 'react'
import { openPathFromClaude } from '../../claudeEditorContext'
import { formatToolElapsed } from '../../lib/claudeProgress'
import { toolRowView } from '../../lib/claudeToolRow'
import { useT } from '../../i18n'
import { useStore } from '../../store'
import { Chevron } from '../common/Chevron'
import { Icon } from '../common/Icon'
import { useThinkingWord } from './useThinkingWord'

type ToolState = 'running' | 'done' | 'error' | 'stopped'

const SIGN: Partial<Record<string, string>> = { add: '+', del: '−', cmd: '❯' }

/**
 * Claude action (design system "Claude actions"): tool icon in a square that shows the state, verb in the
 * past tense, target, `+N −N` and a short datum. With detail, clicking expands the command and output, the read
 * excerpt, the edit diff or the question and answer.
 */
export const ToolRow = memo(function ToolRow({
  name,
  input,
  result,
  running,
  live,
  nested,
  elapsed
}: {
  name: string
  input: unknown
  result: { content: string; isError: boolean } | null
  /** No result and in the current turn, with Claude still working. */
  running: boolean
  /** The tool Claude is running now: the border gets the neon trace (at most one per conversation). */
  live?: boolean
  nested: boolean
  /** Seconds of execution (`toolProgress` event); only while the tool has no result. */
  elapsed?: number | undefined
}) {
  const [open, setOpen] = useState(false)
  const t = useT()
  const root = useStore((s) => s.root)
  // Collapsed, the row only computes the header; the detail lines are born on expand.
  const view = useMemo(() => toolRowView(name, input, result, root, false, t), [name, input, result, root, t])
  const detail = useMemo(
    () => (open ? toolRowView(name, input, result, root, true, t).detail : []),
    [open, name, input, result, root, t]
  )
  const state: ToolState = result?.isError ? 'error' : result ? 'done' : running ? 'running' : 'stopped'
  const can = view.hasDetail

  const head = (
    <>
      <span
        className={`claude-tool-ico ${state}`}
        role="img"
        aria-label={t.claude.toolRowView.states[state]}
        title={t.claude.toolRowView.states[state]}
      >
        <Icon name={view.icon} plain />
      </span>
      <span className="claude-tool-name">{view.label}</span>
      {!view.path && view.target && (
        <span className="claude-tool-target" title={view.target}>
          {view.target}
        </span>
      )}
    </>
  )
  const tail = (
    <>
      {view.stat && (
        <span className="claude-tool-stat">
          <span className="add">+{view.stat.add}</span> <span className="del">−{view.stat.del}</span>
        </span>
      )}
      {view.meta && <span className="claude-tool-meta">{view.meta}</span>}
      {state === 'running' && elapsed !== undefined && (
        <span className="claude-tool-elapsed" data-tool-elapsed={elapsed}>
          · {formatToolElapsed(elapsed)}
        </span>
      )}
      {can && <Icon name="chevron" className={`claude-tool-chev${open ? ' open' : ''}`} />}
    </>
  )

  return (
    <div
      className={`claude-tool ${state}${open ? ' open' : ''}${nested ? ' nested' : ''}${live ? ' neon-live' : ''}`}
      data-tool={name}
      data-tool-state={state}
    >
      {/* The file link stays outside the expand button (a button inside a button is not valid); the whole row
          stays clickable with the mouse and the keyboard uses the button. */}
      <div className={`claude-tool-head${can ? ' can' : ''}`} onClick={can ? () => setOpen(!open) : undefined}>
        {can ? (
          <button
            type="button"
            className="claude-tool-toggle"
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation()
              setOpen(!open)
            }}
          >
            {head}
          </button>
        ) : (
          <span className="claude-tool-toggle">{head}</span>
        )}
        {view.path && (
          <button
            type="button"
            className="claude-tool-target claude-file-link"
            title={t.claude.toolRowView.openInEditor(view.target)}
            onClick={(e) => {
              e.stopPropagation()
              void openPathFromClaude(view.path!)
            }}
          >
            {view.target}
          </button>
        )}
        <span className="claude-tool-spacer" />
        {tail}
      </div>
      {open && can && (
        <div className="claude-tool-detail">
          {detail.map((l, i) => (
            <div key={i} className={`claude-dl${l.kind ? ` ${l.kind}` : ''}`}>
              {l.kind && SIGN[l.kind] && <span className="claude-dl-sign">{SIGN[l.kind]}</span>}
              {l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

/** Claude's reasoning, collapsed by default. */
export const ThinkingRow = memo(function ThinkingRow({
  text,
  live,
  seed,
  nested
}: {
  text: string
  live?: boolean
  /** Picks the word for the "thinking" state (the turn + the block). */
  seed?: string
  nested?: boolean
}) {
  const [open, setOpen] = useState(false)
  const t = useT()
  const word = useThinkingWord(seed ?? '', !!live)
  return (
    <div className={`claude-row thinking${nested ? ' nested' : ''}`}>
      <div className="claude-row-head">
        <button className="claude-row-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Chevron open={open} />
          <i className="codicon codicon-lightbulb" />
          <span className="claude-row-title">{live ? `${word}…` : t.claude.toolRowView.reasoning}</span>
          {live && <i className="codicon codicon-loading codicon-modifier-spin claude-row-state" />}
        </button>
      </div>
      {open && (
        <div className="claude-row-body">
          <pre>{text}</pre>
        </div>
      )}
    </div>
  )
})
