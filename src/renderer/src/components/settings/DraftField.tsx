import { useId, useState } from 'react'

/**
 * Text/number field that only saves on confirm (Enter or leaving the field). While the user types, the draft is
 * local; invalid shows the error and does not send; Esc discards. The draft belongs to the stored value (`base`): when
 * the snapshot brings another value (including an external edit of settings.json) the field shows the stored one again.
 */
export function DraftField({
  value,
  label,
  validate,
  onCommit,
  disabled,
  numeric,
  normalize,
  monospace,
  placeholder,
  unit,
  testId
}: {
  value: string
  label: string
  /** Error message, or `null` if the text is valid. */
  validate: (text: string) => string | null
  /** Saves; `false` = main refused (the toast was already shown) and the draft is discarded. */
  onCommit: (text: string) => Promise<boolean>
  disabled?: boolean
  numeric?: boolean
  /** Canonical form of the typed text (e.g. "014" → "14"); equal to the stored value = nothing to save. */
  normalize?: (text: string) => string
  monospace?: boolean | undefined
  placeholder?: string | undefined
  unit?: string | undefined
  testId?: string
}) {
  const [draft, setDraft] = useState<{ base: string; text: string; error: string | null; sent: boolean } | null>(null)
  const errorId = useId()
  const live = draft && draft.base === value ? draft : null
  const text = live?.text ?? value

  const commit = (): void => {
    if (!live || live.sent) return
    const typed = live.text.trim()
    const error = validate(typed)
    if (error) return setDraft({ ...live, error })
    const next = normalize ? normalize(typed) : typed
    if (next === value) return setDraft(null)
    setDraft({ ...live, text: next, error: null, sent: true })
    // Saved: drops the draft so the field shows the snapshot value. Refused: keeps it, to fix and try again.
    void onCommit(next).then((ok) => setDraft(ok ? null : { ...live, text: next, error: null, sent: false }))
  }

  return (
    <div className="draft-field">
      <div className="draft-row">
        <input
          type="text"
          className={`draft-input${numeric ? ' numeric' : ''}${monospace ? ' mono' : ''}`}
          value={text}
          aria-label={label}
          aria-invalid={live?.error ? true : undefined}
          aria-describedby={live?.error ? errorId : undefined}
          inputMode={numeric ? 'numeric' : undefined}
          placeholder={placeholder}
          disabled={disabled}
          spellCheck={false}
          data-testid={testId}
          onChange={(e) => setDraft({ base: value, text: e.target.value, error: null, sent: false })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape' && live) {
              // Discards the draft without closing the modal.
              e.preventDefault()
              e.stopPropagation()
              setDraft(null)
            }
          }}
          onBlur={commit}
        />
        {unit && <span className="draft-unit">{unit}</span>}
      </div>
      {live?.error && (
        <div id={errorId} className="setting-error" role="alert">
          {live.error}
        </div>
      )}
    </div>
  )
}
