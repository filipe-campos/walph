import { describe, expect, it, vi } from 'vitest'
import { planEolChange } from './eolChange'

const base = { tabEol: 'LF' as const, next: 'CRLF' as const, diskEol: undefined, dirty: false, conflict: false }

describe('planEolChange', () => {
  it('ignores a tab without a detected EOL and switching to the same EOL', () => {
    expect(planEolChange({ ...base, tabEol: null, textSaved: () => true })).toEqual({ kind: 'ignore' })
    expect(planEolChange({ ...base, next: 'LF', textSaved: () => true })).toEqual({ kind: 'ignore' })
  })

  it('first switch: keeps the current EOL as the disk one and announces the clean tab', () => {
    const textSaved = vi.fn(() => true)
    expect(planEolChange({ ...base, textSaved })).toEqual({ kind: 'diverge', diskEol: 'LF', announce: true })
    expect(textSaved).not.toHaveBeenCalled()
  })

  it('an already dirty tab is not announced again', () => {
    expect(planEolChange({ ...base, dirty: true, textSaved: () => false })).toEqual({
      kind: 'diverge',
      diskEol: 'LF',
      announce: false
    })
  })

  it('back to the disk EOL: clean if the text is the saved one', () => {
    expect(
      planEolChange({ ...base, tabEol: 'CRLF', next: 'LF', diskEol: 'LF', dirty: true, textSaved: () => true })
    ).toEqual({ kind: 'restore-disk', clean: true, resync: false })
  })

  it('back to the disk EOL with edited text: stays dirty', () => {
    expect(
      planEolChange({ ...base, tabEol: 'CRLF', next: 'LF', diskEol: 'LF', dirty: true, textSaved: () => false })
    ).toEqual({ kind: 'restore-disk', clean: false, resync: false })
  })

  it('back to the disk EOL in conflict with the saved text: asks to re-read the disk', () => {
    expect(
      planEolChange({
        ...base,
        tabEol: 'CRLF',
        next: 'LF',
        diskEol: 'LF',
        dirty: true,
        conflict: true,
        textSaved: () => true
      })
    ).toEqual({ kind: 'restore-disk', clean: true, resync: true })
  })

  it('a conflict with edited text does not ask for a re-read', () => {
    expect(
      planEolChange({
        ...base,
        tabEol: 'CRLF',
        next: 'LF',
        diskEol: 'LF',
        dirty: true,
        conflict: true,
        textSaved: () => false
      })
    ).toEqual({ kind: 'restore-disk', clean: false, resync: false })
  })
})
