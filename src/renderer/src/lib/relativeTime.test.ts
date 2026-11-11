import { afterEach, describe, expect, it } from 'vitest'
import { setLocale } from '@shared/i18n'
import { formatDate, relativeTime } from './relativeTime'

const now = new Date(2026, 5, 15, 12, 0, 0).getTime()
const ago = (ms: number): number => now - ms
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('relativeTime', () => {
  it('less than a minute (and future dates) is "agora"', () => {
    expect(relativeTime(now, now)).toBe('agora')
    expect(relativeTime(ago(59_000), now)).toBe('agora')
    expect(relativeTime(now + 5 * MIN, now)).toBe('agora')
  })

  it('minutes', () => {
    expect(relativeTime(ago(MIN), now)).toBe('há 1 min')
    expect(relativeTime(ago(5 * MIN + 30_000), now)).toBe('há 5 min')
    expect(relativeTime(ago(59 * MIN), now)).toBe('há 59 min')
  })

  it('hours', () => {
    expect(relativeTime(ago(HOUR), now)).toBe('há 1 h')
    expect(relativeTime(ago(2 * HOUR + 10 * MIN), now)).toBe('há 2 h')
    expect(relativeTime(ago(23 * HOUR + 59 * MIN), now)).toBe('há 23 h')
  })

  it('yesterday and days', () => {
    expect(relativeTime(ago(DAY), now)).toBe('ontem')
    expect(relativeTime(ago(DAY + 20 * HOUR), now)).toBe('ontem')
    expect(relativeTime(ago(2 * DAY), now)).toBe('há 2 dias')
    expect(relativeTime(ago(29 * DAY + 5 * HOUR), now)).toBe('há 29 dias')
  })

  it('after 30 days shows the date', () => {
    const old = new Date(2026, 3, 2, 9, 30).getTime()
    expect(relativeTime(old, now)).toBe('02/04/2026')
    expect(formatDate(new Date(2025, 11, 25).getTime())).toBe('25/12/2025')
  })
})

describe('relativeTime: limits', () => {
  it('exactly 60 s is "há 1 min" and 24 h is "ontem"', () => {
    expect(relativeTime(ago(MIN), now)).toBe('há 1 min')
    expect(relativeTime(ago(DAY), now)).toBe('ontem')
  })

  it('1 ms before each limit stays in the smaller unit', () => {
    expect(relativeTime(ago(MIN - 1), now)).toBe('agora')
    expect(relativeTime(ago(HOUR - 1), now)).toBe('há 59 min')
    expect(relativeTime(ago(DAY - 1), now)).toBe('há 23 h')
    expect(relativeTime(ago(2 * DAY - 1), now)).toBe('ontem')
  })

  it('exactly 30 days already shows the date', () => {
    expect(relativeTime(ago(30 * DAY - 1), now)).toBe('há 29 dias')
    expect(relativeTime(ago(30 * DAY), now)).toBe(formatDate(ago(30 * DAY)))
  })

  it('formatDate pads day and month with a leading zero', () => {
    expect(formatDate(new Date(2024, 0, 5).getTime())).toBe('05/01/2024')
  })
})

describe('relativeTime in another language', () => {
  afterEach(() => setLocale('pt-BR'))

  it('follows the current language in the text and the date', () => {
    setLocale('en')
    expect(relativeTime(ago(5 * MIN), now)).toBe('5 min ago')
    expect(formatDate(new Date(2024, 0, 5).getTime())).toBe('01/05/2024')
    setLocale('es')
    expect(relativeTime(ago(3 * DAY), now)).toBe('hace 3 días')
  })
})
