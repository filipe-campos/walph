import { describe, expect, it } from 'vitest'
import { detectLevel, parseLogLine } from './parseLogs'

describe('parseLogLine', () => {
  it('splits the time from the text', () => {
    expect(parseLogLine('2026-10-17T12:00:00.123456789Z listening on :80', 'stdout')).toEqual({
      time: '2026-10-17T12:00:00.123456789Z',
      text: 'listening on :80',
      level: 'info',
      stream: 'stdout'
    })
  })
  it('no time, CRLF and ANSI', () => {
    const l = parseLogLine('\x1b[31mERROR\x1b[0m boom\r', 'stderr')
    expect(l).toMatchObject({ time: null, text: 'ERROR boom', level: 'error', stream: 'stderr' })
  })
  it('line with time only', () => {
    expect(parseLogLine('2026-10-17T12:00:00Z', 'stdout')).toMatchObject({ time: '2026-10-17T12:00:00Z', text: '' })
  })
})

describe('detectLevel', () => {
  it.each([
    ['[ERROR] x', 'error'],
    ['panic: nil pointer', 'error'],
    ['UnhandledException thrown: Exception in thread', 'error'],
    ['WARN disk almost full', 'warn'],
    ['level=warning msg=x', 'warn'],
    ['DEBUG cache miss', 'debug'],
    ['trace id=1', 'debug'],
    ['0 errors found', 'info'],
    ['started', 'info']
  ])('%s', (text, level) => expect(detectLevel(text)).toBe(level))
  it('stderr alone is not an error', () => expect(parseLogLine('started', 'stderr').level).toBe('info'))
})
