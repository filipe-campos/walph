import type { KeyboardEvent } from 'react'

const ROW = '[data-debug-row]'

/** ↑/↓/Home/End move focus between the list rows (`data-debug-row`); the rest of the keyboard belongs to each row. */
export function onTreeKeyDown(e: KeyboardEvent<HTMLElement>): void {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
  const rows = [...e.currentTarget.querySelectorAll<HTMLElement>(ROW)]
  if (rows.length === 0) return
  const current = rows.findIndex((row) => row.contains(document.activeElement))
  const last = rows.length - 1
  const next =
    e.key === 'Home'
      ? 0
      : e.key === 'End'
        ? last
        : e.key === 'ArrowDown'
          ? Math.min(last, current + 1)
          : Math.max(0, current - 1)
  e.preventDefault()
  rows[next]?.focus()
}
