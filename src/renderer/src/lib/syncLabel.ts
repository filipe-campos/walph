// Texts of the git sync in the status bar.
import { getLocale, t } from '@shared/i18n'

/** "2 commits para enviar · 1 commit para receber (origin/x)"; a zero side disappears; both zero = synced. */
export function syncTooltip(ahead: number, behind: number, upstream: string): string {
  const m = t().git.sync
  const parts: string[] = []
  if (ahead > 0) parts.push(m.toPush(ahead))
  if (behind > 0) parts.push(m.toPull(behind))
  if (parts.length === 0) return m.synced(upstream)
  return `${parts.join(' · ')} (${upstream})`
}

/** "1 selecionado" / "12 selecionados". */
export function selectedLabel(count: number): string {
  return t().files.selectedCount(count)
}

/** Author initials for the avatar: first letter of the first and of the last name ("Ana Souza" → "AS"). */
export function authorInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w))
  if (words.length === 0) return '?'
  const initial = (word: string | undefined): string => [...(word ?? '')][0] ?? ''
  const last = words.length > 1 ? initial(words.at(-1)) : ''
  return (initial(words[0]) + last).toLocaleUpperCase(getLocale())
}
