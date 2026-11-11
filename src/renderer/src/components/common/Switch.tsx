/** Accessible on/off switch (`role="switch"`). The label goes in `label` (accessible name). */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  busy,
  testId,
  id,
  'aria-describedby': describedBy,
  'aria-invalid': invalid
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
  /** Busy: ignores clicks but keeps focus (`aria-disabled`, without `disabled`). */
  busy?: boolean
  testId?: string
  id?: string
  'aria-describedby'?: string | undefined
  'aria-invalid'?: boolean | undefined
}) {
  return (
    <button
      type="button"
      id={id}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch${checked ? ' on' : ''}`}
      disabled={disabled}
      aria-disabled={busy || undefined}
      data-testid={testId}
      onClick={() => !busy && onChange(!checked)}
    >
      <span className="switch-thumb" />
    </button>
  )
}
