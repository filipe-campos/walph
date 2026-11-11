import { describe, expect, it } from 'vitest'
import { formatDuration, formatFullDate, formatTime } from './claudeTime'

describe('formatTime', () => {
  it('24 h HH:mm', () => {
    expect(formatTime(new Date(2026, 9, 19, 14, 5, 9).getTime())).toBe('14:05')
    expect(formatTime(new Date(2026, 9, 19, 0, 7).getTime())).toBe('00:07')
  })
  it('the full date has the year and the month spelled out', () => {
    const full = formatFullDate(new Date(2026, 9, 19, 14, 5, 9).getTime())
    expect(full).toContain('2026')
    expect(full).toContain('outubro')
  })
})

describe('formatDuration', () => {
  it('picks the unit', () => {
    expect(formatDuration(850)).toBe('850 ms')
    expect(formatDuration(4200)).toBe('4,2 s')
    expect(formatDuration(14_400)).toBe('14 s')
    expect(formatDuration(65_000)).toBe('1 min 05 s')
    expect(formatDuration(3_720_000)).toBe('1 h 02 min')
    expect(formatDuration(120_000)).toBe('2 min')
  })
  it('rounds to whole seconds before splitting', () => {
    expect(formatDuration(9_960)).toBe('10 s')
    expect(formatDuration(59_600)).toBe('1 min')
    expect(formatDuration(119_600)).toBe('2 min')
    expect(formatDuration(59_400)).toBe('59 s')
  })
  it('an invalid value becomes empty', () => {
    expect(formatDuration(-1)).toBe('')
    expect(formatDuration(Number.NaN)).toBe('')
  })
})
