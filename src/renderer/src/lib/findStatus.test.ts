import { describe, expect, it } from 'vitest'
import { formatFindStatus } from './findStatus'

const base = { empty: false, invalid: false, total: 0, current: null, capped: false }

describe('formatFindStatus', () => {
  it('an empty term shows nothing', () => {
    expect(formatFindStatus({ ...base, empty: true })).toEqual({ text: '', none: false })
  })
  it('an invalid regex and zero matches are "none"', () => {
    expect(formatFindStatus({ ...base, invalid: true })).toEqual({ text: 'Expressão inválida', none: true })
    expect(formatFindStatus(base)).toEqual({ text: 'Sem resultados', none: true })
  })
  it('position, total and limit', () => {
    expect(formatFindStatus({ ...base, total: 12, current: 3 }).text).toBe('3 de 12')
    expect(formatFindStatus({ ...base, total: 12 }).text).toBe('? de 12')
    expect(formatFindStatus({ ...base, total: 999, current: 5, capped: true }).text).toBe('5 de 999+')
  })
})
