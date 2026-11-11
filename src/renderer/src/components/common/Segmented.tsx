import { useRovingFocus } from './useRovingFocus'

export interface SegmentedOption<T extends string> {
  id: T
  label: string
  title?: string
  disabled?: boolean
}

/** Group of exclusive options (`radiogroup`) with arrows/Home/End, in the `.segmented` look. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  testPrefix,
  itemData
}: {
  label: string
  value: T
  options: readonly SegmentedOption<T>[]
  onChange: (next: T) => void
  className?: string
  /** `data-testid` of each item: `${testPrefix}-${id}`. */
  testPrefix?: string
  /** Extra `data-*` attributes per item. */
  itemData?: (option: SegmentedOption<T>) => Record<`data-${string}`, string>
}) {
  const onKeyDown = useRovingFocus({ orientation: 'both', selector: '[role="radio"]', activate: true })
  return (
    <div
      className={`segmented${className ? ` ${className}` : ''}`}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          tabIndex={value === o.id ? 0 : -1}
          disabled={o.disabled}
          title={o.title}
          className={`segmented-item${value === o.id ? ' on' : ''}`}
          data-testid={testPrefix ? `${testPrefix}-${o.id}` : undefined}
          {...itemData?.(o)}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
