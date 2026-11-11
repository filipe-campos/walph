import { describe, expect, it } from 'vitest'
import {
  MAX_LINK_LENGTH,
  parseAckChars,
  parseCreateOptions,
  parseLinkPath,
  parseResize,
  parseWriteData
} from './validate'

describe('parseCreateOptions', () => {
  it('reads the string fields', () => {
    expect(parseCreateOptions({ cwd: '/x', profile: 'zsh', dockerExec: 'abc' })).toEqual({
      cwd: '/x',
      profile: 'zsh',
      dockerExec: 'abc',
      claudeLogin: false,
      debugRun: null
    })
    expect(parseCreateOptions({ claudeLogin: true }).claudeLogin).toBe(true)
    expect(parseCreateOptions({ debugRun: 't-1' }).debugRun).toBe('t-1')
    expect(parseCreateOptions({ debugRun: 1 }).debugRun).toBeNull()
    expect(parseCreateOptions({ claudeLogin: 'yes' }).claudeLogin).toBe(false)
  })
  it('discards wrong types and an empty cwd', () => {
    expect(parseCreateOptions({ cwd: '', profile: 1, dockerExec: {} })).toEqual({
      cwd: null,
      profile: null,
      dockerExec: null,
      claudeLogin: false,
      debugRun: null
    })
  })
  it.each([undefined, null, 'x', 3])('input %j becomes empty options', (v) => {
    expect(parseCreateOptions(v)).toEqual({
      cwd: null,
      profile: null,
      dockerExec: null,
      claudeLogin: false,
      debugRun: null
    })
  })
})

describe('parseWriteData / parseAckChars', () => {
  it('write only accepts a string', () => {
    expect(parseWriteData('ls\r')).toBe('ls\r')
    expect(parseWriteData('')).toBe('')
    expect(parseWriteData(1)).toBeNull()
  })
  it('ack only accepts a positive finite number', () => {
    expect(parseAckChars(10)).toBe(10)
    for (const v of [0, -1, NaN, Infinity, '5', null]) expect(parseAckChars(v)).toBeNull()
  })
})

describe('parseResize', () => {
  it('accepts integers from 1 to 1000', () => {
    expect(parseResize(80, 24)).toEqual({ cols: 80, rows: 24 })
    expect(parseResize(1, 1000)).toEqual({ cols: 1, rows: 1000 })
  })
  it('truncates the fraction and caps at 1000', () => {
    expect(parseResize(80.7, 24.2)).toEqual({ cols: 80, rows: 24 })
    expect(parseResize(5000, 1001)).toEqual({ cols: 1000, rows: 1000 })
  })
  it.each([
    [0, 24],
    [80, 0],
    [0.5, 24],
    [NaN, 24],
    [Infinity, 24],
    [-3, 24],
    ['80', 24],
    [80, null]
  ])('rejects %j x %j', (cols, rows) => {
    expect(parseResize(cols, rows)).toBeNull()
  })
})

describe('parseLinkPath', () => {
  it('accepts a common path', () => {
    expect(parseLinkPath('src/a.ts')).toBe('src/a.ts')
  })
  it('rejects empty, long, null-byte and non-string', () => {
    for (const v of ['', 'a\0b', 'a'.repeat(MAX_LINK_LENGTH + 1), 1, null]) expect(parseLinkPath(v)).toBeNull()
    expect(parseLinkPath('a'.repeat(MAX_LINK_LENGTH))).not.toBeNull()
  })
})
