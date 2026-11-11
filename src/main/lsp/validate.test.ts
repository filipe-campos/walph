import { describe, expect, it } from 'vitest'
import {
  isVersion,
  parseChanges,
  parseCommand,
  parseFormatOptions,
  parsePosition,
  parseRange,
  parseTrigger
} from './validate'

const ok = { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, text: 'x' }

describe('parseChanges', () => {
  it('accepts valid changes and rejects the rest', () => {
    expect(parseChanges([ok])).toEqual([ok])
    expect(parseChanges('x')).toBeNull()
    expect(parseChanges([{ ...ok, text: 1 }])).toBeNull()
    expect(parseChanges([{ text: 'x' }])).toBeNull()
    expect(parseChanges([{ ...ok, range: { start: { line: -1, character: 0 }, end: ok.range.end } }])).toBeNull()
  })
})

describe('isVersion', () => {
  it('non-negative integer', () => {
    expect(isVersion(0)).toBe(true)
    expect(isVersion(1.5)).toBe(false)
    expect(isVersion('1')).toBe(false)
  })
})

describe('request validation', () => {
  it('parsePosition / parseRange', () => {
    expect(parsePosition({ line: 1, character: 2 })).toEqual({ line: 1, character: 2 })
    expect(parsePosition({ line: -1, character: 2 })).toBeNull()
    expect(parsePosition({ line: 1.5, character: 2 })).toBeNull()
    expect(parsePosition(null)).toBeNull()
    expect(parseRange({ start: { line: 0, character: 0 }, end: { line: 1, character: 0 } })).not.toBeNull()
    expect(parseRange({ start: { line: 0, character: 0 } })).toBeNull()
  })

  it('parseFormatOptions requires tabSize 1..16 and a boolean insertSpaces', () => {
    expect(parseFormatOptions({ tabSize: 2, insertSpaces: true })).toEqual({ tabSize: 2, insertSpaces: true })
    expect(parseFormatOptions({ tabSize: 0, insertSpaces: true })).toBeNull()
    expect(parseFormatOptions({ tabSize: 17, insertSpaces: true })).toBeNull()
    expect(parseFormatOptions({ tabSize: 2, insertSpaces: 'x' })).toBeNull()
  })

  it('parseCommand validates and requires serializable arguments', () => {
    expect(parseCommand({ title: 'T', command: 'c' })).toEqual({ title: 'T', command: 'c' })
    expect(parseCommand({ title: 'T', command: 'c', arguments: [1, { a: 2 }] })).toEqual({
      title: 'T',
      command: 'c',
      arguments: [1, { a: 2 }]
    })
    expect(parseCommand({ title: 'T', command: '' })).toBeNull()
    expect(parseCommand({ title: 'T', command: 'c', arguments: 'x' })).toBeNull()
    expect(parseCommand({ title: 'T', command: 'c', arguments: [1n] })).toBeNull()
    const cyclic: unknown[] = []
    cyclic.push(cyclic)
    expect(parseCommand({ title: 'T', command: 'c', arguments: cyclic })).toBeNull()
    expect(parseCommand({ title: 'T', command: 'c', arguments: ['x'.repeat(1_100_000)] })).toBeNull()
  })

  it('parseTrigger', () => {
    expect(parseTrigger(undefined)).toBeUndefined()
    expect(parseTrigger('.')).toBe('.')
    expect(parseTrigger('')).toBeNull()
    expect(parseTrigger(3)).toBeNull()
  })
})
