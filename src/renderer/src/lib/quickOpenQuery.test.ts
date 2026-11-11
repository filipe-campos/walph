import { describe, expect, it } from 'vitest'
import { parseFileQuery, parseLineQuery, quickInputMode, toReveal } from './quickOpenQuery'

describe('quickInputMode', () => {
  it('picks the mode by prefix', () => {
    expect(quickInputMode('>term')).toBe('commands')
    expect(quickInputMode(':30')).toBe('line')
    expect(quickInputMode('@fn')).toBe('symbols')
    expect(quickInputMode('#Foo')).toBe('workspaceSymbols')
    expect(quickInputMode('store')).toBe('files')
    expect(quickInputMode('')).toBe('files')
    expect(quickInputMode(' >x')).toBe('files')
  })
})

describe('parseFileQuery', () => {
  it('extracts the line from file:line', () => {
    expect(parseFileQuery('store.ts:30')).toEqual({ text: 'store.ts', line: 30 })
  })
  it('extracts line and column', () => {
    expect(parseFileQuery('store.ts:30:5')).toEqual({ text: 'store.ts', line: 30, column: 5 })
  })
  it('tolerates a trailing colon without a number', () => {
    expect(parseFileQuery('src/App.tsx:42:')).toEqual({ text: 'src/App.tsx', line: 42 })
    expect(parseFileQuery('App.tsx:')).toEqual({ text: 'App.tsx' })
  })
  it('without a colon returns only the text', () => {
    expect(parseFileQuery('  store.ts ')).toEqual({ text: 'store.ts' })
  })
  it('a colon followed by non-digits stays in the text', () => {
    expect(parseFileQuery('a:b')).toEqual({ text: 'a:b' })
    expect(parseFileQuery('a:b:3')).toEqual({ text: 'a:b', line: 3 })
  })
  it('clamps absurd numbers to safe integers and a minimum of 1', () => {
    expect(parseFileQuery('a.ts:99999999999999999999').line).toBe(2 ** 31 - 1)
    expect(parseFileQuery('a.ts:0').line).toBe(1)
  })
})

describe('parseLineQuery', () => {
  it('accepts :30, 30 and :30:5', () => {
    expect(parseLineQuery(':30')).toEqual({ status: 'ok', line: 30 })
    expect(parseLineQuery('30')).toEqual({ status: 'ok', line: 30 })
    expect(parseLineQuery(':30:5')).toEqual({ status: 'ok', line: 30, column: 5 })
  })
  it('accepts an empty column', () => {
    expect(parseLineQuery(':30:')).toEqual({ status: 'ok', line: 30 })
  })
  it('empty', () => {
    expect(parseLineQuery('')).toEqual({ status: 'empty' })
    expect(parseLineQuery(':')).toEqual({ status: 'empty' })
    expect(parseLineQuery(':  ')).toEqual({ status: 'empty' })
  })
  it('invalid', () => {
    expect(parseLineQuery(':abc')).toEqual({ status: 'invalid' })
    expect(parseLineQuery(':-1')).toEqual({ status: 'invalid' })
    expect(parseLineQuery(':3:x')).toEqual({ status: 'invalid' })
  })
  it('line 0 becomes line 1', () => {
    expect(parseLineQuery(':0')).toEqual({ status: 'ok', line: 1 })
  })
})

describe('toReveal', () => {
  it('converts a 1-based column to 0-based', () => {
    expect(toReveal(12, 3)).toEqual({ line: 12, column: 2, length: 0 })
  })
  it('without a column uses column 0', () => {
    expect(toReveal(7)).toEqual({ line: 7, column: 0, length: 0 })
  })
  it('never produces a negative column', () => {
    expect(toReveal(1, 0).column).toBe(0)
  })
})
