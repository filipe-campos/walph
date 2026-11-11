import { describe, expect, it } from 'vitest'
import { evaluateWhen, parseWhen, whenDisjoint, whenTextsDisjoint, type WhenContext } from './when'

function run(text: string, ctx: WhenContext): boolean {
  const parsed = parseWhen(text)
  if ('error' in parsed) throw new Error(parsed.error)
  return evaluateWhen(parsed.expr, ctx)
}

describe('parseWhen / evaluateWhen', () => {
  it('identifier, negation and absence as false', () => {
    expect(run('terminalFocus', { terminalFocus: true })).toBe(true)
    expect(run('terminalFocus', {})).toBe(false)
    expect(run('!terminalFocus', {})).toBe(true)
    expect(run('!!terminalFocus', { terminalFocus: true })).toBe(true)
  })

  it('precedence: ! > && > ||', () => {
    // a || b && c  ==  a || (b && c)
    expect(run('terminalFocus || editorFocus && !terminalFocus', { terminalFocus: true })).toBe(true)
    expect(run('editorFocus && terminalFocus || terminalFocus', { editorFocus: true })).toBe(false)
    expect(run('!terminalFocus && editorFocus', { editorFocus: true })).toBe(true)
    expect(run('!terminalFocus && editorFocus', { editorFocus: true, terminalFocus: true })).toBe(false)
  })

  it('parentheses change the precedence', () => {
    const ctx = { terminalFocus: true }
    expect(run('(terminalFocus || editorFocus) && editorFocus', ctx)).toBe(false)
    expect(run('terminalFocus || editorFocus && editorFocus', ctx)).toBe(true)
    expect(run('!(terminalFocus || editorFocus)', {})).toBe(true)
  })

  it('tolerates spaces (or none) and line breaks', () => {
    expect(run('  !terminalFocus   &&\teditorFocus ', { editorFocus: true })).toBe(true)
    expect(run('!terminalFocus&&editorFocus', { editorFocus: true })).toBe(true)
  })

  it.each([
    ['', 'vazia'],
    ['   ', 'vazia'],
    ['doesNotExist', 'desconhecido'],
    ['terminalFocus && somethingElse', 'desconhecido'],
    ['terminalFocus &&', 'termina'],
    ['|| terminalFocus', 'inesperado'],
    ['terminalFocus editorFocus', 'inesperado'],
    ['terminalFocus & editorFocus', 'caractere'],
    ['terminalFocus == true', 'caractere'],
    ['(terminalFocus', 'parêntese'],
    ['terminalFocus)', 'inesperado'],
    ['!', 'termina']
  ])('"%s" is an error (%s)', (text, fragment) => {
    const parsed = parseWhen(text)
    expect(parsed).toHaveProperty('error')
    expect('error' in parsed && parsed.error).toContain(fragment)
  })
})

describe('whenDisjoint', () => {
  it('opposite negations and complementary focuses are disjoint', () => {
    expect(whenTextsDisjoint('terminalFocus', '!terminalFocus')).toBe(true)
    expect(whenTextsDisjoint('claudeFocus', '!claudeFocus')).toBe(true)
  })

  it('a possible overlap is not disjunction; undefined always holds', () => {
    expect(whenTextsDisjoint(undefined, undefined)).toBe(false)
    expect(whenTextsDisjoint(undefined, 'terminalFocus')).toBe(false)
    // Focuses are exclusive (a single activeElement).
    expect(whenTextsDisjoint('terminalFocus', 'editorFocus')).toBe(true)
    expect(whenTextsDisjoint('editorFocus', '!terminalFocus')).toBe(false)
    expect(whenTextsDisjoint('editorFocus', '!claudeFocus')).toBe(false)
    expect(whenTextsDisjoint('terminalFocus || editorFocus', '!terminalFocus')).toBe(false)
    expect(whenTextsDisjoint('terminalFocus && editorFocus', '!terminalFocus')).toBe(true)
  })

  it('an unsatisfiable clause is disjoint from everything, including undefined', () => {
    const never = parseWhen('terminalFocus && !terminalFocus')
    if (!('expr' in never)) throw new Error('parse')
    expect(whenDisjoint(never.expr, undefined)).toBe(true)
    expect(whenDisjoint(undefined, never.expr)).toBe(true)
  })

  it('invalid text counts as always active', () => {
    expect(whenTextsDisjoint('doesNotExist', '!terminalFocus')).toBe(false)
  })
})
