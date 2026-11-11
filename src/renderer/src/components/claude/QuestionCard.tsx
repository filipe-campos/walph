import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { ClaudePermissionRequest, ClaudePermissionResponse } from '@shared/types'
import { respondPermission } from '../../claudePermissions'
import { useT } from '../../i18n'
import { Icon } from '../common/Icon'
import { useFocusRegion } from '../common/useFocusRegion'
import { useRovingFocus } from '../common/useRovingFocus'
import { useCardAutoFocus } from './useCardAutoFocus'
import {
  EMPTY_ANSWER,
  buildAnswers,
  isAnswered,
  numberKeyTarget,
  pickOption,
  pickOther,
  typeOther,
  type QuestionAnswer
} from '../../lib/claudeQuestion'
import { Button } from '../common/Button'

// Pause so the user sees the checked option before the single question advances.
const ADVANCE_MS = 160

const isTextTarget = (el: EventTarget | null): boolean =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement

/** Claude's questions (`AskUserQuestion`): one tab per question, numbered options and "Other" with free text. */
export function QuestionCard({
  conversationId,
  request
}: {
  conversationId: string
  request: Extract<ClaudePermissionRequest, { kind: 'question' }>
}) {
  const t = useT()
  const m = t.claude.questionCard
  const { questions, requestId } = request
  // The parent uses `key={requestId}`: the state is born clean for each request, without a reset in an effect.
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<Record<string, QuestionAnswer>>({})
  // Response in flight: locks Answer/Skip/Enter until the ack (a rejection unlocks and keeps the draft).
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const cardRef = useFocusRegion<HTMLDivElement>(`claudeCard:${requestId}`, { intoRef: rootRef })
  const otherRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const last = questions.length - 1
  const q = questions[current]
  const done = questions.map((x) => isAnswered(x, answers[x.id]))
  const complete = done.every(Boolean)

  const cancelAdvance = (): void => {
    clearTimeout(timer.current)
    timer.current = undefined
  }
  useEffect(() => cancelAdvance, [])

  // Root with tabIndex -1: Space/Enter click nothing, the numbers still work.
  const noteIntent = useCardAutoFocus(rootRef, conversationId, current)
  const onTabsKeyDown = useRovingFocus({ activate: true })
  if (!q) return null
  const answer = answers[q.id] ?? EMPTY_ANSWER

  const goTo = (index: number): void => {
    noteIntent()
    cancelAdvance()
    setCurrent(Math.min(Math.max(index, 0), last))
  }

  const update = (fn: (a: QuestionAnswer) => QuestionAnswer): void =>
    setAnswers((prev) => ({ ...prev, [q.id]: fn(prev[q.id] ?? EMPTY_ANSWER) }))

  const send = (response: ClaudePermissionResponse): void => {
    if (sendingRef.current) return
    sendingRef.current = true
    cancelAdvance()
    setSending(true)
    // Accepted: the card leaves the panel. Rejected: unlocks, with the answers intact.
    void respondPermission(conversationId, requestId, response).then((ok) => {
      if (ok) return
      sendingRef.current = false
      setSending(false)
    })
  }

  const submit = (): void => {
    const result = buildAnswers(questions, answers)
    if (result) send({ behavior: 'answer', answers: result })
  }

  const choose = (index: number): void => {
    update((a) => pickOption(q, a, index))
    if (q.multiSelect) return
    // Single: advances by itself; on the last one it just stays checked (sending is the user's decision).
    cancelAdvance()
    noteIntent()
    if (current < last) timer.current = setTimeout(() => setCurrent((c) => Math.min(c + 1, last)), ADVANCE_MS)
  }

  const chooseOther = (): void => {
    cancelAdvance()
    update((a) => pickOther(q, a))
    // Free text: focus goes to the field instead of advancing.
    if (!q.multiSelect || !answer.other) otherRef.current?.focus()
  }

  const next = (): void => {
    if (current < last) goTo(current + 1)
    else if (complete) submit()
    else {
      const open = done.indexOf(false)
      if (open >= 0) goTo(open)
    }
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
    if (sendingRef.current) return
    if (isTextTarget(e.target)) {
      if (e.key === 'Enter' && !e.nativeEvent.isComposing && isAnswered(q, answer)) {
        e.preventDefault()
        next()
      }
      return
    }
    if ((e.key === 'Home' || e.key === 'End') && (e.target as HTMLElement).getAttribute('role') === 'tab') {
      e.preventDefault()
      onTabsKeyDown(e)
      return
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      if ((e.target as HTMLElement).getAttribute('role') === 'tab') onTabsKeyDown(e)
      else goTo(Math.min(Math.max(current + (e.key === 'ArrowRight' ? 1 : -1), 0), last))
      return
    }
    const target = numberKeyTarget(e.key, q)
    if (!target) return
    e.preventDefault()
    if (target.type === 'option') choose(target.index)
    else chooseOther()
  }

  const otherNumber = q.options.length + 1

  return (
    <div
      ref={cardRef}
      className="claude-card claude-question neon"
      role="group"
      aria-label={m.ariaLabel}
      data-request-id={requestId}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div className="claude-question-head">
        <span className="claude-question-ico" aria-hidden>
          <Icon name="question" />
        </span>
        <span className="claude-question-kicker">{m.kicker}</span>
        <button
          type="button"
          className="claude-question-skip"
          title={m.skip}
          aria-label={m.skip}
          aria-disabled={sending || undefined}
          onClick={() => send({ behavior: 'skip' })}
        >
          <Icon name="close" />
        </button>
      </div>

      {questions.length > 1 && (
        <div className="claude-question-tabs" role="tablist" aria-label={m.questions}>
          {questions.map((x, i) => (
            <button
              key={x.id}
              id={`${requestId}-tab-${i}`}
              role="tab"
              type="button"
              className={`claude-question-tab${i === current ? ' active' : ''}${done[i] ? ' answered' : ''}`}
              aria-selected={i === current}
              aria-controls={`${requestId}-panel`}
              aria-label={done[i] ? m.answered(x.header) : x.header}
              tabIndex={i === current ? 0 : -1}
              onClick={() => goTo(i)}
            >
              <span className="claude-question-step-n" aria-hidden>
                {done[i] ? <Icon name="check" /> : i + 1}
              </span>
              <span className="claude-question-step-label">{x.header}</span>
            </button>
          ))}
        </div>
      )}

      <div
        id={`${requestId}-panel`}
        key={q.id}
        className="claude-question-panel"
        role={questions.length > 1 ? 'tabpanel' : 'group'}
        aria-labelledby={questions.length > 1 ? `${requestId}-tab-${current}` : undefined}
        aria-label={questions.length > 1 ? undefined : q.header}
      >
        <div className="claude-question-text" id={`${requestId}-q`}>
          {q.question}
        </div>
        {q.multiSelect && <div className="claude-question-hint">{m.chooseMany}</div>}
        <div
          className="claude-question-options"
          role={q.multiSelect ? 'group' : 'radiogroup'}
          aria-labelledby={`${requestId}-q`}
        >
          {q.options.map((o, i) => {
            const on = answer.picked.includes(i)
            return (
              <button
                key={i}
                type="button"
                role={q.multiSelect ? 'checkbox' : 'radio'}
                aria-checked={on}
                className={`claude-question-option claude-question-row${on ? ' selected' : ''}${q.multiSelect ? ' multi' : ''}`}
                onClick={() => choose(i)}
              >
                <span className="claude-question-mark" aria-hidden>
                  {on && <Icon name="check" />}
                </span>
                <span className="claude-question-body">
                  <span className="claude-question-label">{o.label}</span>
                  {o.description && <span className="claude-question-desc">{o.description}</span>}
                </span>
                {i < 9 && (
                  <kbd className="claude-question-key" aria-hidden>
                    {i + 1}
                  </kbd>
                )}
              </button>
            )
          })}
          <div className={`claude-question-row claude-question-other${answer.other ? ' selected' : ''}`}>
            <button
              type="button"
              role={q.multiSelect ? 'checkbox' : 'radio'}
              aria-checked={answer.other}
              aria-label={m.other}
              className={`claude-question-other-toggle${q.multiSelect ? ' multi' : ''}`}
              onClick={chooseOther}
            >
              <span className="claude-question-mark" aria-hidden>
                {answer.other && <Icon name="check" />}
              </span>
              <span className="claude-question-label">{m.other}</span>
            </button>
            <input
              ref={otherRef}
              className="claude-card-input"
              value={answer.otherText}
              placeholder={m.otherPlaceholder}
              aria-label={m.otherLabel}
              maxLength={500}
              onChange={(e) => update((a) => typeOther(q, a, e.target.value))}
            />
            {otherNumber <= 9 && (
              <kbd className="claude-question-key" aria-hidden>
                {otherNumber}
              </kbd>
            )}
          </div>
        </div>
      </div>

      <div className="claude-question-footer">
        {questions.length > 1 ? (
          <span className="claude-question-count" aria-live="polite">
            {m.count(current + 1, questions.length)}
          </span>
        ) : (
          <span className="claude-question-keys">{m.keys(Math.min(q.options.length + 1, 9))}</span>
        )}
        <div className="claude-card-actions">
          {current > 0 && (
            <Button variant="ghost" size="sm" onClick={() => goTo(current - 1)}>
              {m.back}
            </Button>
          )}
          {current < last && (
            <Button size="sm" onClick={() => goTo(current + 1)}>
              {m.next}
            </Button>
          )}
          {current === last && (
            <Button
              variant="primary"
              size="sm"
              disabled={!complete}
              busy={sending}
              title={complete ? undefined : m.answerAll}
              onClick={submit}
            >
              {m.submit}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
