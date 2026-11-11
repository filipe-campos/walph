import { useId, useRef, useState } from 'react'
import type { KeyboardEvent, SyntheticEvent } from 'react'
import type { ClaudeElicitationField, ClaudePermissionRequest, ClaudePermissionResponse } from '@shared/types'
import { respondPermission } from '../../claudePermissions'
import {
  buildContent,
  initialDrafts,
  urlHost,
  validateAll,
  validateField,
  type FieldDraft
} from '../../lib/claudeElicitation'
import { useT } from '../../i18n'
import { Icon } from '../common/Icon'
import { Select } from '../common/Select'
import { Switch } from '../common/Switch'
import { useFocusRegion } from '../common/useFocusRegion'
import { useCardAutoFocus } from './useCardAutoFocus'
import { Button } from '../common/Button'

type Request = Extract<ClaudePermissionRequest, { kind: 'elicitation' }>

// Up to this many, single-choice options show as radios; above that it becomes a dropdown.
const RADIO_LIMIT = 4

const INPUT_TYPES = { email: 'email', uri: 'url', date: 'date', 'date-time': 'datetime-local' } as const

function FieldControl({
  field,
  id,
  draft,
  invalid,
  describedBy,
  onChange
}: {
  field: ClaudeElicitationField
  id: string
  draft: FieldDraft | undefined
  invalid: boolean
  describedBy: string | undefined
  onChange: (next: FieldDraft) => void
}) {
  const a11y = {
    'aria-required': field.required || undefined,
    'aria-invalid': invalid || undefined,
    'aria-describedby': describedBy
  }
  const common = { id, ...a11y }
  // Groups (radios/checkboxes): the container carries the id and accepts programmatic focus (first invalid field).
  const group = { id, tabIndex: -1, ...a11y }
  switch (field.type) {
    case 'string':
      return (
        <input
          {...common}
          className="claude-card-input"
          type={field.format ? INPUT_TYPES[field.format] : 'text'}
          value={typeof draft === 'string' ? draft : ''}
          minLength={field.minLength}
          maxLength={field.maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'number':
      return (
        <input
          {...common}
          className="claude-card-input"
          type="number"
          value={typeof draft === 'string' ? draft : ''}
          min={field.minimum}
          max={field.maximum}
          step={field.integer ? 1 : 'any'}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'boolean':
      return (
        <Switch
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          checked={draft === true}
          label={field.label}
          onChange={(next) => {
            onChange(next)
          }}
        />
      )
    case 'enum': {
      if (field.multiple) {
        const picked = Array.isArray(draft) ? draft : []
        return (
          <div className="claude-elicit-options" role="group" aria-labelledby={`${id}-label`} {...group}>
            {field.options.map((o) => (
              <label key={o.value} className="claude-elicit-option">
                <input
                  type="checkbox"
                  checked={picked.includes(o.value)}
                  onChange={(e) => {
                    onChange(e.target.checked ? [...picked, o.value] : picked.filter((v) => v !== o.value))
                  }}
                />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        )
      }
      const value = typeof draft === 'string' ? draft : ''
      if (field.options.length > RADIO_LIMIT)
        return (
          <Select
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            value={value}
            label={field.label}
            options={[...(field.required ? [] : [{ value: '', label: '—' }]), ...field.options]}
            onChange={(next) => {
              onChange(next)
            }}
          />
        )
      return (
        <div className="claude-elicit-options" role="radiogroup" aria-labelledby={`${id}-label`} {...group}>
          {field.options.map((o) => (
            <label key={o.value} className="claude-elicit-option">
              <input
                type="radio"
                name={id}
                checked={value === o.value}
                onChange={() => {
                  onChange(o.value)
                }}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      )
    }
  }
}

/**
 * Request from an MCP server (elicitation). `form` = schema fields; `url` = open a page in the browser (main
 * opens it). Same rules as `QuestionCard`: the card only leaves after main's ack (a rejection keeps what was typed).
 */
export function ElicitationCard({ conversationId, request }: { conversationId: string; request: Request }) {
  const t = useT()
  const m = t.claude.elicitationCard
  const { requestId, fields, mode, url } = request
  // Element ids come from `useId` + position: the schema key is server text (spaces, collisions).
  const uid = useId()
  // The parent uses `key={requestId}`: the state is born clean for each request, without a reset in an effect.
  const [initial] = useState(() => initialDrafts(fields))
  const [drafts, setDrafts] = useState<Record<string, FieldDraft>>(initial)
  const [submitted, setSubmitted] = useState(false)
  // Response in flight: locks the buttons until the ack (a rejection unlocks and keeps the draft).
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const cardRef = useFocusRegion<HTMLDivElement>(`claudeCard:${requestId}`, { intoRef: rootRef })

  useCardAutoFocus(rootRef, conversationId, undefined, (root) =>
    root.querySelector<HTMLElement>('.claude-elicit-form input:not([hidden]), .claude-elicit-form button:not([hidden])')
  )

  const errors = validateAll(fields, drafts)
  // Errors only after the first submit attempt (then, live): showing them on blur pushes the layout in the middle of
  // the next click and the control right below loses the click.
  const shown = (key: string): string | null => (submitted ? (errors[key] ?? null) : null)

  const send = (response: ClaudePermissionResponse): void => {
    if (sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    // Accepted: the card leaves the panel. Rejected: unlocks, with the fields intact.
    void respondPermission(conversationId, requestId, response).then((ok) => {
      if (ok) return
      sendingRef.current = false
      setSending(false)
    })
  }

  const submit = (e?: SyntheticEvent): void => {
    e?.preventDefault()
    if (sendingRef.current) return
    const content = buildContent(fields, drafts)
    if (!content) {
      setSubmitted(true)
      const bad = fields.findIndex((f) => validateField(f, drafts[f.key]))
      const el = bad >= 0 ? document.getElementById(`${uid}-f${bad}`) : null
      // Radio/checkbox group: focus goes to its first control.
      const target = el?.matches('input, button, select, textarea')
        ? el
        : el?.querySelector<HTMLElement>('input, button')
      target?.focus()
      return
    }
    send({ behavior: 'elicitation', action: 'accept', content })
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    // Whoever already used the Esc (open dropdown) marked the event.
    if (e.key !== 'Escape' || e.defaultPrevented || e.nativeEvent.isComposing) return
    // Already edited form: Esc does not discard what was typed (the "x" cancels on purpose).
    if (mode === 'form' && JSON.stringify(drafts) !== JSON.stringify(initial)) return
    e.preventDefault()
    send({ behavior: 'elicitation', action: 'cancel' })
  }

  const host = url ? urlHost(url) : null

  return (
    <div
      ref={cardRef}
      className="claude-card claude-question claude-elicitation neon"
      role="group"
      aria-label={m.ariaLabel(request.serverName)}
      data-request-id={requestId}
      data-elicitation-mode={mode}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div className="claude-question-head">
        <span className="claude-question-ico" aria-hidden>
          <Icon name="layers" />
        </span>
        <span className="claude-question-kicker" data-elicitation-server>
          {m.kicker(request.serverName)}
        </span>
        <button
          type="button"
          className="claude-question-skip"
          title={m.closeTitle}
          aria-label={m.close}
          data-action="cancel"
          aria-disabled={sending || undefined}
          onClick={() => send({ behavior: 'elicitation', action: 'cancel' })}
        >
          <Icon name="close" />
        </button>
      </div>

      {request.title && <div className="claude-elicit-title">{request.title}</div>}
      {/* Plain server text: never markdown (nor links). */}
      <div className="claude-question-text" data-elicitation-message>
        {request.message}
      </div>

      {mode === 'url' ? (
        <div className="claude-elicit-url-box">
          {host && (
            <div className="claude-elicit-host" data-elicitation-host>
              {host}
            </div>
          )}
          <code className="claude-elicit-url" data-elicitation-url>
            {url}
          </code>
          <div className="claude-question-hint">{m.urlHint}</div>
        </div>
      ) : (
        <form className="claude-elicit-form" noValidate onSubmit={submit}>
          {fields.map((field, index) => {
            const id = `${uid}-f${index}`
            const error = shown(field.key)
            const hint = field.description ? `${id}-hint` : undefined
            const describedBy = [hint, error ? `${id}-error` : undefined].filter(Boolean).join(' ') || undefined
            const inline = field.type === 'boolean'
            return (
              <div key={field.key} className={`claude-elicit-field${inline ? ' inline' : ''}`} data-field={field.key}>
                <label id={`${id}-label`} htmlFor={id} className="claude-elicit-label">
                  {field.label}
                  {field.required && (
                    <span className="claude-elicit-req" aria-hidden>
                      {' '}
                      *
                    </span>
                  )}
                </label>
                {inline ? (
                  <div className="claude-elicit-switch">
                    <FieldControl
                      field={field}
                      id={id}
                      draft={drafts[field.key]}
                      invalid={!!error}
                      describedBy={describedBy}
                      onChange={(next) => setDrafts((d) => ({ ...d, [field.key]: next }))}
                    />
                  </div>
                ) : (
                  <FieldControl
                    field={field}
                    id={id}
                    draft={drafts[field.key]}
                    invalid={!!error}
                    describedBy={describedBy}
                    onChange={(next) => setDrafts((d) => ({ ...d, [field.key]: next }))}
                  />
                )}
                {field.description && (
                  <div id={hint} className="claude-question-hint">
                    {field.description}
                  </div>
                )}
                {error && (
                  <div id={`${id}-error`} className="claude-elicit-error" role="alert">
                    {error}
                  </div>
                )}
              </div>
            )
          })}
          {/* Enter in a field submits; the real button is in the footer. */}
          <button type="submit" hidden tabIndex={-1} aria-hidden />
        </form>
      )}

      <div className="claude-question-footer">
        <span className="claude-question-keys">
          {mode === 'url' ? m.escHint : fields.some((f) => f.required) ? m.required : ''}
        </span>
        <div className="claude-card-actions">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            data-action="decline"
            busy={sending}
            onClick={() => send({ behavior: 'elicitation', action: 'decline' })}
          >
            {m.decline}
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="button"
            data-action="accept"
            busy={sending}
            onClick={() => (mode === 'url' ? send({ behavior: 'elicitation', action: 'accept' }) : submit())}
          >
            {mode === 'url' ? m.openInBrowser : m.send}
          </Button>
        </div>
      </div>
    </div>
  )
}
