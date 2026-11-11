import { describe, expect, it } from 'vitest'
import { parseJsonc } from './parseJsonc'

describe('parseJsonc', () => {
  it('reads plain JSON', () => {
    expect(parseJsonc('{"a": 1, "b": [true, null]}')).toEqual({ value: { a: 1, b: [true, null] } })
  })

  it('accepts comments and a trailing comma', () => {
    const text = '{\n  // theme\n  "a": 1, /* x */\n  "b": [1, 2,],\n}'
    expect(parseJsonc(text)).toEqual({ value: { a: 1, b: [1, 2] } })
  })

  it('ignores the leading BOM', () => {
    expect(parseJsonc('\uFEFF{"a": 1}')).toEqual({ value: { a: 1 } })
  })

  it.each(['', '   \n\t', '// comment only', '/* a */ // b\n', '\uFEFF'])('"%s" is an empty file', (text) => {
    const result = parseJsonc(text)
    expect(result).toEqual({ value: undefined })
  })

  it('reports the error in pt-BR with 1-based line and column', () => {
    const result = parseJsonc('{\n  "a": 1\n  "b": 2\n}')
    expect(result).toEqual({ error: '"," esperada (linha:coluna 3:3)' })
  })

  it('reports an invalid symbol on the first line', () => {
    expect(parseJsonc('{ a: 1 }')).toHaveProperty('error', expect.stringContaining('(linha:coluna 1:3)'))
  })

  it('reports only the first error', () => {
    const result = parseJsonc('{ a: 1, b: 2 }')
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error.match(/linha:coluna/g)).toHaveLength(1)
  })

  it('counts the line with CRLF', () => {
    const result = parseJsonc('{\r\n  "a": 1\r\n  "b": 2\r\n}')
    expect(result).toEqual({ error: '"," esperada (linha:coluna 3:3)' })
  })

  it('unterminated string becomes a pt-BR message', () => {
    const result = parseJsonc('{"a": "abc')
    expect(result).toHaveProperty('error', expect.stringContaining('não terminado'))
  })

  it('primitive top-level values are valid', () => {
    expect(parseJsonc('42')).toEqual({ value: 42 })
  })
})
