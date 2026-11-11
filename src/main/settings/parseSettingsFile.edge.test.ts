import { describe, expect, it } from 'vitest'
import { parseJsonc } from './parseJsonc'
import { parseSettingsFile } from './parseSettingsFile'

describe('parseJsonc', () => {
  it('reads line and block comments, including multi-line ones', () => {
    const text = '{\n  // line\n  /* block\n     on several lines */\n  "a": 1\n}'
    expect(parseJsonc(text)).toEqual({ value: { a: 1 } })
  })

  it('"//" inside a string is not a comment', () => {
    expect(parseJsonc('{ "url": "http://x.com/*a*/" }')).toEqual({ value: { url: 'http://x.com/*a*/' } })
  })

  it('accepts a trailing comma in an object and in a list', () => {
    expect(parseJsonc('{ "a": [1, 2,], }')).toEqual({ value: { a: [1, 2] } })
  })

  it('empty, whitespace-only and comment-only count as undefined', () => {
    expect(parseJsonc('')).toEqual({ value: undefined })
    expect(parseJsonc(' \n\t ')).toEqual({ value: undefined })
    expect(parseJsonc('// a\n/* b */\n')).toEqual({ value: undefined })
  })

  it('the error reports a 1-based line:column, also with CRLF', () => {
    const lf = parseJsonc('{\n  "a": 1\n  "b": 2\n}')
    const crlf = parseJsonc('{\r\n  "a": 1\r\n  "b": 2\r\n}')
    expect(lf).toEqual({ error: expect.stringContaining('linha:coluna 3:3') })
    expect(crlf).toEqual({ error: expect.stringContaining('linha:coluna 3:3') })
  })

  it('an error on the first line is 1:n', () => {
    expect(parseJsonc('{ "a": }')).toEqual({ error: expect.stringMatching(/\(linha:coluna 1:\d+\)/) })
  })

  it('the line accounts for comments before the error', () => {
    const result = parseJsonc('// c1\n// c2\n{ "a": @ }')
    expect(result).toEqual({ error: expect.stringContaining('linha:coluna 3:') })
  })

  it('an unterminated string and an open block comment are errors', () => {
    expect(parseJsonc('{ "a": "abc')).toHaveProperty('error')
    expect(parseJsonc('{ "a": 1 /* open')).toHaveProperty('error')
  })

  it('message in pt-BR (without the parser English text)', () => {
    const result = parseJsonc('{ "a" 1 }') as { error: string }
    expect(result.error).toMatch(/^[^A-Z]*\(linha:coluna/)
    expect(result.error).not.toMatch(/expected/i)
  })

  it('content after an error does not hide the first error', () => {
    const result = parseJsonc('{ "a" 1,\n "b" 2 }') as { error: string }
    expect(result.error).toContain('1:')
  })
})

describe('parseSettingsFile (edge cases)', () => {
  it('validates every key and keeps the valid ones when others are invalid', () => {
    const result = parseSettingsFile(`{
      "editor.fontSize": 5,
      "editor.tabSize": 8,
      "editor.wordWrap": "on",
      "files.exclude": { "**/dist": true, "**/x": 1 },
      "workbench.theme": "",
      "terminal.shell": "/bin/zsh"
    }`)
    expect(result).toEqual({
      values: { 'editor.tabSize': 8, 'editor.wordWrap': 'on', 'terminal.shell': '/bin/zsh' },
      warnings: expect.arrayContaining([
        expect.stringContaining('"editor.fontSize"'),
        expect.stringContaining('"files.exclude"'),
        expect.stringContaining('"workbench.theme"')
      ])
    })
    expect('warnings' in result && result.warnings).toHaveLength(3)
  })

  it('a wrong type in several fields becomes one warning per key', () => {
    const result = parseSettingsFile(
      '{ "editor.insertSpaces": "yes", "editor.fontSize": "16", "editor.lineNumbers": true }'
    )
    expect(result).toMatchObject({ values: {} })
    expect('warnings' in result && result.warnings).toHaveLength(3)
  })

  it.each(['null', '"text"', 'true', '[]', '{} {}'])('invalid root "%s" is a file error', (text) => {
    expect(parseSettingsFile(text)).toHaveProperty('error')
  })

  it('a syntax error returns no values (main keeps the last valid version)', () => {
    const result = parseSettingsFile('{ "editor.fontSize": 16, ')
    expect(result).toHaveProperty('error')
    expect(result).not.toHaveProperty('values')
  })

  it('a file with CRLF and comments is read normally', () => {
    const text = '{\r\n  // c\r\n  "editor.fontSize": 18,\r\n}\r\n'
    expect(parseSettingsFile(text)).toEqual({ values: { 'editor.fontSize': 18 }, warnings: [] })
  })

  it('the template without active values (all commented out) counts as {}', () => {
    expect(parseSettingsFile('{\n  // "editor.fontSize": 16\n}')).toEqual({ values: {}, warnings: [] })
  })

  it('a file with a BOM is read', () => {
    expect(parseSettingsFile('﻿{ "editor.fontSize": 16 }')).toEqual({
      values: { 'editor.fontSize': 16 },
      warnings: []
    })
  })
})
