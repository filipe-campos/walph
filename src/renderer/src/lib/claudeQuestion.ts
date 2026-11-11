import type { ClaudeQuestion } from '@shared/types'

/** In-progress answer of ONE question: marked options (indexes) + "Other" with free text. */
export interface QuestionAnswer {
  picked: number[]
  other: boolean
  otherText: string
}

export const EMPTY_ANSWER: QuestionAnswer = { picked: [], other: false, otherText: '' }

/**
 * Choosing an option: single swaps the marked one (and releases "Other"); multiple toggles. The "Other" text is kept.
 */
export function pickOption(q: ClaudeQuestion, a: QuestionAnswer, index: number): QuestionAnswer {
  if (index < 0 || index >= q.options.length) return a
  if (!q.multiSelect) return { ...a, picked: [index], other: false }
  const picked = a.picked.includes(index)
    ? a.picked.filter((i) => i !== index)
    : [...a.picked, index].sort((x, y) => x - y)
  return { ...a, picked }
}

/** Marking "Other": single releases the options; multiple toggles. */
export function pickOther(q: ClaudeQuestion, a: QuestionAnswer): QuestionAnswer {
  if (!q.multiSelect) return { ...a, picked: [], other: true }
  return { ...a, other: !a.other }
}

/**
 * Typing in "Other" marks it (in single, releases the options); erasing everything leaves it marked, but unanswered.
 */
export function typeOther(q: ClaudeQuestion, a: QuestionAnswer, text: string): QuestionAnswer {
  if (a.other || !text.trim()) return { ...a, otherText: text }
  return { ...pickOther(q, a), otherText: text }
}

/** "Other" only counts with text; marked and empty answers nothing. */
function otherValue(a: QuestionAnswer): string | null {
  const text = a.otherText.trim()
  return a.other && text ? text : null
}

/** Values to send for the question, or `null` if it is not answered yet. */
export function buildAnswer(q: ClaudeQuestion, a: QuestionAnswer): string[] | null {
  const other = otherValue(a)
  if (!q.multiSelect) {
    if (a.other) return other ? [other] : null
    const option = q.options[a.picked[0] ?? -1]
    return option ? [option.label] : null
  }
  const values = a.picked.flatMap((i) => (q.options[i] ? [q.options[i].label] : []))
  if (other) values.push(other)
  return values.length > 0 ? values : null
}

export const isAnswered = (q: ClaudeQuestion, a: QuestionAnswer | undefined): boolean =>
  !!a && buildAnswer(q, a) !== null

/** `{ [id]: values }` only when ALL are answered. */
export function buildAnswers(
  questions: ClaudeQuestion[],
  answers: Record<string, QuestionAnswer>
): Record<string, string[]> | null {
  const out: Record<string, string[]> = {}
  for (const q of questions) {
    const values = buildAnswer(q, answers[q.id] ?? EMPTY_ANSWER)
    if (!values) return null
    out[q.id] = values
  }
  return out
}

export type NumberTarget = { type: 'option'; index: number } | { type: 'other' } | null

/** Key 1–9 → option (1 = first); "Other" is the number after the last option, if it still fits in 9. */
export function numberKeyTarget(key: string, q: ClaudeQuestion): NumberTarget {
  if (!/^[1-9]$/.test(key)) return null
  const n = Number(key)
  if (n <= q.options.length) return { type: 'option', index: n - 1 }
  return n === q.options.length + 1 ? { type: 'other' } : null
}
