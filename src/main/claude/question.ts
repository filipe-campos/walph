// Claude questions (`AskUserQuestion`). Pure: validates and normalizes the tool input (model content, untrusted),
// validates the renderer answer (also untrusted) and builds the `updatedInput` the CLI expects.
//
// The CLI keys `answers` by the question TEXT and, in multiple choice, joins the labels with ", ". That is why
// `question` and `label` are never truncated (truncating would break the mapping): past the limit, the input is
// rejected.

import { stripControl } from '@shared/controlChars'
import { isRecord } from '@shared/guards'
import { t } from '@shared/i18n'
import type { ClaudeQuestion } from '@shared/types'

const MAX_QUESTIONS = 4
/** The card numbers the options from 1 to 9 with "Other" last. */
const MAX_OPTIONS = 8
const MAX_QUESTION_LENGTH = 1000
const MAX_LABEL_LENGTH = 200
// Bidi overrides/isolates: in `question`/`label` (keys, not cleanable) they would allow hiding the real text on screen.
const BIDI_CONTROLS = /[\u202a-\u202e\u2066-\u2069]/

const MAX_HEADER_LENGTH = 40
const MAX_DESCRIPTION_LENGTH = 1000
export const MAX_ANSWER_LENGTH = 2000

/** Message returned to Claude when the user dismisses the questions (no `interrupt`: it carries on alone). */
export const SKIP_MESSAGE =
  'The user skipped the questions and wants you to decide on your own. Continue with your best judgment.'

export type NormalizeResult = { ok: true; questions: ClaudeQuestion[] } | { ok: false; error: string }
export type AnswerResult = { ok: true; updatedInput: Record<string, unknown> } | { ok: false; error: string }

/** Display-only fields: no control characters (the line break is kept where it makes sense). */
const clean = (s: string): string => stripControl(s, { keepNewlines: true })
const oneLine = (s: string): string => clean(s).replace(/\s+/g, ' ').trim()

function truncate(s: string, max: number): string {
  const chars = [...s]
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : s
}

/**
 * Validates the `AskUserQuestion` input. Never throws; the `error` (English) goes back to Claude so it tries again.
 * Questions without `options` (the CLI's "extended" text/number types) are rejected: Claude falls back to plain text.
 * The key returned to the CLI is always the ORIGINAL question text; duplicates are detected after `trim`.
 */
export function normalizeQuestions(input: unknown): NormalizeResult {
  const fail = (error: string): NormalizeResult => ({ ok: false, error })
  if (!isRecord(input) || !Array.isArray(input.questions)) return fail('"questions" must be an array.')
  const raw = input.questions
  if (raw.length < 1 || raw.length > MAX_QUESTIONS) {
    return fail(`"questions" must have between 1 and ${MAX_QUESTIONS} items (got ${raw.length}).`)
  }

  const texts = new Set<string>()
  const questions: ClaudeQuestion[] = []
  for (let i = 0; i < raw.length; i++) {
    const q: unknown = raw[i]
    const at = `questions[${i}]`
    if (!isRecord(q)) return fail(`${at} must be an object.`)
    if (typeof q.question !== 'string' || q.question.trim() === '') {
      return fail(`${at}.question must be a non-empty string.`)
    }
    if (q.question.length > MAX_QUESTION_LENGTH) {
      return fail(`${at}.question is too long (max ${MAX_QUESTION_LENGTH} characters).`)
    }
    if (BIDI_CONTROLS.test(q.question)) return fail(`${at}.question contains bidirectional control characters.`)
    if (texts.has(q.question.trim())) {
      return fail(`${at}.question duplicates another question; each question must be unique.`)
    }
    texts.add(q.question.trim())
    if (q.header !== undefined && typeof q.header !== 'string') return fail(`${at}.header must be a string.`)
    if (q.multiSelect !== undefined && typeof q.multiSelect !== 'boolean') {
      return fail(`${at}.multiSelect must be a boolean.`)
    }
    if (!Array.isArray(q.options) || q.options.length < 1 || q.options.length > MAX_OPTIONS) {
      return fail(`${at}.options must have between 1 and ${MAX_OPTIONS} items.`)
    }

    const labels = new Set<string>()
    const options: ClaudeQuestion['options'] = []
    for (let j = 0; j < q.options.length; j++) {
      const o: unknown = q.options[j]
      const oat = `${at}.options[${j}]`
      if (!isRecord(o)) return fail(`${oat} must be an object.`)
      if (typeof o.label !== 'string' || o.label.trim() === '') return fail(`${oat}.label must be a non-empty string.`)
      if (o.label.length > MAX_LABEL_LENGTH)
        return fail(`${oat}.label is too long (max ${MAX_LABEL_LENGTH} characters).`)
      if (BIDI_CONTROLS.test(o.label)) return fail(`${oat}.label contains bidirectional control characters.`)
      if (labels.has(o.label.trim())) return fail(`${oat}.label duplicates another option of the same question.`)
      labels.add(o.label.trim())
      if (o.description !== undefined && typeof o.description !== 'string') {
        return fail(`${oat}.description must be a string.`)
      }
      options.push({
        label: o.label.trim(),
        description: truncate(
          clean(typeof o.description === 'string' ? o.description : '').trim(),
          MAX_DESCRIPTION_LENGTH
        )
      })
    }

    const header = typeof q.header === 'string' ? truncate(oneLine(q.header), MAX_HEADER_LENGTH) : ''
    questions.push({
      id: `q${i + 1}`,
      header: header === '' ? t().claudeHost.conversation.questionHeader(i + 1) : header,
      question: q.question,
      options,
      multiSelect: q.multiSelect === true
    })
  }
  return { ok: true, questions }
}

/**
 * Validates the renderer answer against the normalized questions and builds the CLI `updatedInput`:
 * `{ ...input, answers: { [question text]: values.join(', ') } }`. Invalid answer → `ok: false` (the caller ignores
 * the answer and keeps the request pending, instead of sending garbage to Claude).
 */
export function buildAnswerInput(
  input: Record<string, unknown>,
  questions: readonly ClaudeQuestion[],
  answers: unknown
): AnswerResult {
  const fail = (error: string): AnswerResult => ({ ok: false, error })
  if (!isRecord(answers)) return fail('Invalid answers.')
  const known = new Set(questions.map((q) => q.id))
  for (const id of Object.keys(answers)) if (!known.has(id)) return fail(`Answer for an unknown question: ${id}.`)

  const result: Record<string, string> = {}
  for (const q of questions) {
    const values: unknown = answers[q.id]
    if (!Array.isArray(values)) return fail(`Question without an answer: ${q.id}.`)
    if (q.multiSelect ? values.length < 1 : values.length !== 1) return fail(`Invalid number of answers: ${q.id}.`)
    // One per option + the "Other" text.
    if (values.length > q.options.length + 1) return fail(`Too many answers: ${q.id}.`)
    const picked: string[] = []
    for (const v of values as unknown[]) {
      if (typeof v !== 'string') return fail(`Invalid answer: ${q.id}.`)
      const text = v.trim()
      if (text === '' || text.length > MAX_ANSWER_LENGTH) return fail(`Invalid answer: ${q.id}.`)
      // Repeated (e.g. a checked option + the same text in "Other"): drop it instead of rejecting.
      if (!picked.includes(text)) picked.push(text)
    }
    result[q.question] = picked.join(', ')
  }
  return { ok: true, updatedInput: { ...input, answers: result } }
}
