import { describe, expect, it } from 'vitest'
import type { LspCodeAction } from '@shared/types'
import { hasAutoFix, sortCodeActions } from './codeActions'

const action = (title: string, extra: Partial<LspCodeAction> = {}): LspCodeAction => ({ title, ...extra })

describe('sortCodeActions', () => {
  it('puts the preferred first and the disabled last, keeping the server order', () => {
    const sorted = sortCodeActions([
      action('a', { disabled: 'no reason' }),
      action('b'),
      action('c', { isPreferred: true }),
      action('d')
    ])
    expect(sorted.map((x) => x.title)).toEqual(['c', 'b', 'd', 'a'])
  })

  it('does not change the received list', () => {
    const list = [action('x', { disabled: 'm' }), action('y')]
    sortCodeActions(list)
    expect(list.map((x) => x.title)).toEqual(['x', 'y'])
  })
})

describe('hasAutoFix', () => {
  it('only counts a preferred and enabled quick fix', () => {
    expect(hasAutoFix([action('a', { isPreferred: true, kind: 'quickfix' })])).toBe(true)
    expect(hasAutoFix([action('a', { isPreferred: true })])).toBe(true)
    expect(hasAutoFix([action('a', { isPreferred: true, kind: 'refactor.extract' })])).toBe(false)
    expect(hasAutoFix([action('a', { isPreferred: true, disabled: 'x' })])).toBe(false)
    expect(hasAutoFix([action('a')])).toBe(false)
  })
})
