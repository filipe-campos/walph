import { describe, expect, it } from 'vitest'
import type { ClaudeQuestion } from '@shared/types'
import { buildAnswerInput, normalizeQuestions } from './question'

const q = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  question: 'Which library?',
  header: 'Library',
  options: [
    { label: 'zustand', description: 'Simple' },
    { label: 'redux', description: 'Verbose' }
  ],
  multiSelect: false,
  ...over
})

function ok(input: unknown): ClaudeQuestion[] {
  const r = normalizeQuestions(input)
  if (!r.ok) throw new Error(r.error)
  return r.questions
}
const error = (input: unknown): string => {
  const r = normalizeQuestions(input)
  if (r.ok) throw new Error('expected a rejection')
  return r.error
}

describe('normalizeQuestions', () => {
  it('normalizes ids, header and options', () => {
    const [a, b] = ok({ questions: [q(), q({ question: 'Another?', header: '', multiSelect: undefined })] })
    expect(a).toEqual({
      id: 'q1',
      header: 'Library',
      question: 'Which library?',
      multiSelect: false,
      options: [
        { label: 'zustand', description: 'Simple' },
        { label: 'redux', description: 'Verbose' }
      ]
    })
    expect(b).toMatchObject({ id: 'q2', header: 'Pergunta 2', multiSelect: false })
  })

  it('drops preview, strips controls and truncates display fields', () => {
    const [a] = ok({
      questions: [
        q({
          header: `a\u0007b${'x'.repeat(100)}`,
          options: [{ label: 'A', description: `d\u0000${'y'.repeat(2000)}`, preview: '<b>' }, { label: 'B' }]
        })
      ]
    })
    expect(a.header).toHaveLength(40)
    expect(a.header.startsWith('abxx')).toBe(true)
    expect(a.options[0].description).toHaveLength(1000)
    expect(a.options[0].description.startsWith('dy')).toBe(true)
    expect(a.options[0]).not.toHaveProperty('preview')
    expect(a.options[1].description).toBe('')
  })

  it('rejects malformed input with a message, without throwing', () => {
    for (const bad of [null, undefined, 'x', 1, [], {}, { questions: 'x' }, { questions: [] }, { questions: [null] }]) {
      expect(error(bad)).toBeTruthy()
    }
    expect(error({ questions: [q({ question: '  ' })] })).toContain('question')
    expect(error({ questions: [q({ question: 5 })] })).toContain('question')
    expect(error({ questions: [q({ header: 5 })] })).toContain('header')
    expect(error({ questions: [q({ options: 'x' })] })).toContain('options')
    expect(error({ questions: [q({ options: [] })] })).toContain('options')
    expect(error({ questions: [q({ options: [null] })] })).toContain('options[0]')
    expect(error({ questions: [q({ options: [{ label: '' }] })] })).toContain('label')
    expect(error({ questions: [q({ options: [{ label: 'A', description: 3 }] })] })).toContain('description')
  })

  it('applies count and size limits', () => {
    expect(error({ questions: Array.from({ length: 5 }, (_, i) => q({ question: `q${i}` })) })).toContain(
      'between 1 and 4'
    )
    expect(ok({ questions: Array.from({ length: 4 }, (_, i) => q({ question: `q${i}` })) })).toHaveLength(4)
    const opts = (n: number): unknown[] => Array.from({ length: n }, (_, i) => ({ label: `o${i}` }))
    expect(ok({ questions: [q({ options: opts(8) })] })[0].options).toHaveLength(8)
    expect(error({ questions: [q({ options: opts(9) })] })).toContain('options')
    expect(error({ questions: [q({ question: 'x'.repeat(1001) })] })).toContain('too long')
    expect(error({ questions: [q({ options: [{ label: 'x'.repeat(201) }] })] })).toContain('too long')
  })

  it('requires a boolean multiSelect (missing means false)', () => {
    expect(error({ questions: [q({ multiSelect: 'true' })] })).toContain('multiSelect')
    expect(error({ questions: [q({ multiSelect: 1 })] })).toContain('multiSelect')
    expect(ok({ questions: [q({ multiSelect: true })] })[0].multiSelect).toBe(true)
    expect(ok({ questions: [q({ multiSelect: undefined })] })[0].multiSelect).toBe(false)
  })

  it('rejects duplicates that only differ by spaces and bidi controls in the keys', () => {
    expect(error({ questions: [q(), q({ question: ' Which library? ' })] })).toContain('duplicates')
    expect(error({ questions: [q({ options: [{ label: 'A' }, { label: 'A ' }] })] })).toContain('duplicates')
    expect(error({ questions: [q({ question: 'Which\u202e?' })] })).toContain('bidirectional')
    expect(error({ questions: [q({ options: [{ label: 'A\u2066' }] })] })).toContain('bidirectional')
    // The key returned to the CLI is still the original text.
    expect(ok({ questions: [q({ question: ' Which? ' })] })[0].question).toBe(' Which? ')
  })

  it('rejects questions without options (the CLI extended text/number types)', () => {
    expect(error({ questions: [q({ options: undefined, type: 'text' })] })).toContain('options')
  })

  it('rejects duplicate question texts and labels', () => {
    expect(error({ questions: [q(), q()] })).toContain('duplicates')
    expect(error({ questions: [q({ options: [{ label: 'A' }, { label: 'A' }] })] })).toContain('duplicates')
  })
})

describe('buildAnswerInput', () => {
  const input = { questions: [], metadata: { source: 'x' } }
  const questions = ok({
    questions: [q(), q({ question: 'Which ones?', header: 'Extras', multiSelect: true })]
  })

  it('maps by the question text and joins multiple with ", "', () => {
    const r = buildAnswerInput(input, questions, { q1: ['zustand'], q2: ['redux', 'zustand'] })
    expect(r).toEqual({
      ok: true,
      updatedInput: { ...input, answers: { 'Which library?': 'zustand', 'Which ones?': 'redux, zustand' } }
    })
  })

  it('accepts the "Other" free text and trims it', () => {
    const r = buildAnswerInput(input, questions, { q1: ['  jotai  '], q2: ['redux', 'valtio'] })
    expect(r).toMatchObject({ ok: true, updatedInput: { answers: { 'Which library?': 'jotai' } } })
  })

  it('rejects invalid answers', () => {
    const bad = (answers: unknown): void => expect(buildAnswerInput(input, questions, answers).ok).toBe(false)
    bad(null)
    bad([])
    bad({ q1: ['zustand'] }) // q2 missing
    bad({ q1: ['zustand'], q2: ['redux'], q3: ['x'] }) // unknown id
    bad({ q1: [], q2: ['redux'] })
    bad({ q1: ['zustand', 'redux'], q2: ['redux'] }) // single with 2
    bad({ q1: ['zustand'], q2: [] }) // empty multiple
    bad({ q1: ['zustand'], q2: 'redux' })
    bad({ q1: [''], q2: ['redux'] })
    bad({ q1: ['   '], q2: ['redux'] })
    bad({ q1: [5], q2: ['redux'] })
    bad({ q1: ['x'.repeat(2001)], q2: ['redux'] })
    bad({ q1: ['zustand'], q2: ['a', 'b', 'c', 'd'] }) // more than options + 1
  })

  it('dedupes repeated values instead of rejecting', () => {
    const r = buildAnswerInput(input, questions, { q1: ['zustand'], q2: ['redux', ' redux', 'redux'] })
    expect(r).toMatchObject({ ok: true, updatedInput: { answers: { 'Which ones?': 'redux' } } })
  })
})
