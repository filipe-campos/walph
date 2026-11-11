import { describe, expect, it } from 'vitest'
import { parseMatch, parseOptions, parseQuery, parseReplaceRequest } from './validate'

const options = { caseSensitive: false, regex: true, wholeWord: false, include: '*.ts' }
const match = { line: 1, column: 0, length: 3, text: 'foo' }

describe('parseQuery', () => {
  it('accepts text, including empty', () => {
    expect(parseQuery('')).toBe('')
    expect(parseQuery('foo')).toBe('foo')
  })
  it.each([undefined, null, 3, {}])('refuses %j', (v) => {
    expect(() => parseQuery(v)).toThrow('Consulta de busca inválida.')
  })
})

describe('parseOptions', () => {
  it('accepts complete options', () => {
    expect(parseOptions(options)).toEqual(options)
  })
  it.each([
    null,
    [],
    'x',
    { ...options, regex: 'yes' },
    { ...options, caseSensitive: undefined },
    { ...options, include: 3 },
    { ...options, exclude: [] }
  ])('refuses %j', (v) => {
    expect(() => parseOptions(v)).toThrow('Opções de busca inválidas.')
  })
})

describe('parseMatch', () => {
  it('accepts a valid match', () => {
    expect(parseMatch(match)).toEqual(match)
  })
  it.each([
    null,
    { ...match, line: 0 },
    { ...match, line: 1.5 },
    { ...match, column: -1 },
    { ...match, length: -1 },
    { ...match, text: 1 }
  ])('refuses %j', (v) => {
    expect(() => parseMatch(v)).toThrow('Pedido de substituição inválido.')
  })
})

describe('parseReplaceRequest', () => {
  const valid = { query: 'a', replacement: 'b', options, files: [{ path: '/x/a.ts', matches: [match] }] }
  it('accepts a valid request', () => {
    expect(parseReplaceRequest(valid)).toEqual(valid)
  })
  it.each([
    null,
    { ...valid, query: 1 },
    { ...valid, replacement: null },
    { ...valid, files: 'x' },
    { ...valid, files: [{ path: 1, matches: [] }] },
    { ...valid, files: [{ path: '/a', matches: [{}] }] }
  ])('refuses %j', (v) => {
    expect(() => parseReplaceRequest(v)).toThrow('Pedido de substituição inválido.')
  })
  it('refuses malformed options', () => {
    expect(() => parseReplaceRequest({ ...valid, options: {} })).toThrow('Opções de busca inválidas.')
  })
})
