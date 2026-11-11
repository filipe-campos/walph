import { describe, expect, it } from 'vitest'
import type { LspLogEntry } from '@shared/types'
import { appendLog, appendLogs, formatLogTime, mergeLog } from './lspLog'

const entry = (n: number, message = `m${n}`): LspLogEntry => ({ time: n, server: 'typescript', level: 'info', message })

describe('appendLog', () => {
  it('appends to the end and respects the limit by dropping the oldest', () => {
    expect(appendLog([entry(1), entry(2)], entry(3), 3).map((e) => e.time)).toEqual([1, 2, 3])
    expect(appendLog([entry(1), entry(2), entry(3)], entry(4), 3).map((e) => e.time)).toEqual([2, 3, 4])
  })
})

describe('appendLogs', () => {
  it('appends the batch and respects the limit; an empty batch returns the same list', () => {
    const base = [entry(1)]
    expect(appendLogs(base, [])).toBe(base)
    expect(appendLogs([entry(1), entry(2)], [entry(3), entry(4)], 3).map((e) => e.time)).toEqual([2, 3, 4])
  })
})

describe('mergeLog', () => {
  it('merges history and live without repeating what is in both', () => {
    const merged = mergeLog([entry(1), entry(2)], [entry(2), entry(3)])
    expect(merged.map((e) => e.time)).toEqual([1, 2, 3])
  })

  it('legitimate identical lines (same time and text) are kept beyond what the history already has', () => {
    const merged = mergeLog([entry(1, 'x')], [entry(1, 'x'), entry(1, 'x')])
    expect(merged).toHaveLength(2)
  })

  it('applies the limit', () => {
    expect(mergeLog([entry(1), entry(2)], [entry(3), entry(4)], 3).map((e) => e.time)).toEqual([2, 3, 4])
  })
})

describe('formatLogTime', () => {
  it('formats HH:MM:SS with leading zeros', () => {
    expect(formatLogTime(new Date(2026, 0, 2, 3, 4, 5).getTime())).toBe('03:04:05')
  })
})
