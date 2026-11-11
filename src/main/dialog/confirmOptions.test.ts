import { describe, expect, it } from 'vitest'
import { parseConfirmOptions } from './confirmOptions'

describe('parseConfirmOptions', () => {
  it('accepts valid options', () => {
    expect(parseConfirmOptions({ message: 'Discard?', confirmLabel: 'Discard', destructive: true })).toEqual({
      message: 'Discard?',
      detail: undefined,
      confirmLabel: 'Discard',
      destructive: true
    })
  })

  it('rejects invalid inputs', () => {
    expect(parseConfirmOptions(null)).toBeNull()
    expect(parseConfirmOptions('x')).toBeNull()
    expect(parseConfirmOptions({ message: '', confirmLabel: 'Ok' })).toBeNull()
    expect(parseConfirmOptions({ message: 'a', confirmLabel: 1 })).toBeNull()
    expect(parseConfirmOptions({ message: 'a', confirmLabel: 'Ok', detail: 3 })).toBeNull()
  })
})

describe('parseConfirmOptions: extra cases', () => {
  it('limits the length of the message, the detail and the label', () => {
    const parsed = parseConfirmOptions({
      message: 'm'.repeat(5000),
      detail: 'd'.repeat(5000),
      confirmLabel: 'r'.repeat(100)
    })
    expect(parsed?.message).toHaveLength(2000)
    expect(parsed?.detail).toHaveLength(2000)
    expect(parsed?.confirmLabel).toHaveLength(40)
  })

  it('only accepts destructive exactly true', () => {
    expect(parseConfirmOptions({ message: 'a', confirmLabel: 'b', destructive: 'true' })?.destructive).toBe(false)
    expect(parseConfirmOptions({ message: 'a', confirmLabel: 'b', destructive: 1 })?.destructive).toBe(false)
    expect(parseConfirmOptions({ message: 'a', confirmLabel: 'b' })?.destructive).toBe(false)
  })

  it('rejects whitespace-only message or label and wrong types', () => {
    expect(parseConfirmOptions({ message: '   ', confirmLabel: 'Ok' })).toBeNull()
    expect(parseConfirmOptions({ message: 'a', confirmLabel: ' \n ' })).toBeNull()
    expect(parseConfirmOptions({ message: 1, confirmLabel: 'Ok' })).toBeNull()
    expect(parseConfirmOptions(undefined)).toBeNull()
    expect(parseConfirmOptions([])).toBeNull()
  })

  it('extra fields do not leak into the result', () => {
    const parsed = parseConfirmOptions({ message: 'a', confirmLabel: 'b', buttons: ['x'], type: 'error' })
    expect(Object.keys(parsed!).sort()).toEqual(['confirmLabel', 'destructive', 'detail', 'message'])
  })
})
