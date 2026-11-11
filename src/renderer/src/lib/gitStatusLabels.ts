import { t } from '@shared/i18n'

const CODES = ['M', 'A', 'D', 'R', 'C', 'T', 'U'] as const
type Code = (typeof CODES)[number]

const isCode = (code: string): code is Code => (CODES as readonly string[]).includes(code)

/** Label of a git status letter (porcelain or `--name-status`); an unknown one comes back as it came. */
export function gitStatusLabel(code: string): string {
  const labels = t().git.status
  if (code === '?') return labels.untracked
  return isCode(code) ? labels[code] : code
}
