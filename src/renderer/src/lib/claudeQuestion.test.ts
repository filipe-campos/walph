import { describe, expect, it } from 'vitest'
import type { ClaudeQuestion } from '@shared/types'
import {
  EMPTY_ANSWER,
  buildAnswer,
  buildAnswers,
  isAnswered,
  numberKeyTarget,
  pickOption,
  pickOther,
  typeOther
} from './claudeQuestion'

const opt = (label: string) => ({ label, description: '' })
const single: ClaudeQuestion = {
  id: 'q1',
  header: 'A',
  question: '?',
  options: [opt('x'), opt('y')],
  multiSelect: false
}
const multi: ClaudeQuestion = {
  id: 'q2',
  header: 'B',
  question: '?',
  options: [opt('a'), opt('b'), opt('c')],
  multiSelect: true
}

describe('claudeQuestion', () => {
  it('single: choosing swaps the option and releases Other', () => {
    let a = pickOption(single, EMPTY_ANSWER, 0)
    a = pickOption(single, a, 1)
    expect(buildAnswer(single, a)).toEqual(['y'])
    a = typeOther(single, a, 'my text')
    expect(a.picked).toEqual([])
    expect(buildAnswer(single, a)).toEqual(['my text'])
    expect(buildAnswer(single, pickOption(single, a, 0))).toEqual(['x'])
  })

  it('single: Other marked without text is not answered', () => {
    const a = pickOther(single, EMPTY_ANSWER)
    expect(isAnswered(single, a)).toBe(false)
    expect(isAnswered(single, typeOther(single, a, '   '))).toBe(false)
  })

  it('multiple: toggles, keeps the option order and adds the Other text', () => {
    let a = pickOption(multi, EMPTY_ANSWER, 2)
    a = pickOption(multi, a, 0)
    expect(buildAnswer(multi, a)).toEqual(['a', 'c'])
    a = typeOther(multi, a, ' qualquer ')
    expect(buildAnswer(multi, a)).toEqual(['a', 'c', 'qualquer'])
    a = pickOption(multi, a, 0)
    expect(buildAnswer(multi, a)).toEqual(['c', 'qualquer'])
  })

  it('multiple: nothing (or only an empty Other) is not answered', () => {
    expect(isAnswered(multi, EMPTY_ANSWER)).toBe(false)
    expect(isAnswered(multi, pickOther(multi, EMPTY_ANSWER))).toBe(false)
    const a = pickOption(multi, EMPTY_ANSWER, 1)
    expect(isAnswered(multi, a)).toBe(true)
    expect(buildAnswer(multi, pickOption(multi, a, 1))).toBeNull()
  })

  it('an invalid index is ignored', () => {
    expect(pickOption(single, EMPTY_ANSWER, 9)).toBe(EMPTY_ANSWER)
  })

  it('buildAnswers only returns when everything is answered', () => {
    const answers = { q1: pickOption(single, EMPTY_ANSWER, 0) }
    expect(buildAnswers([single, multi], answers)).toBeNull()
    expect(buildAnswers([single, multi], { ...answers, q2: pickOption(multi, EMPTY_ANSWER, 1) })).toEqual({
      q1: ['x'],
      q2: ['b']
    })
  })

  it('number keys', () => {
    expect(numberKeyTarget('1', single)).toEqual({ type: 'option', index: 0 })
    expect(numberKeyTarget('2', single)).toEqual({ type: 'option', index: 1 })
    expect(numberKeyTarget('3', single)).toEqual({ type: 'other' })
    expect(numberKeyTarget('4', single)).toBeNull()
    expect(numberKeyTarget('0', single)).toBeNull()
    expect(numberKeyTarget('a', single)).toBeNull()
  })
})
