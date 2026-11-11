import { HighlightStyle } from '@codemirror/language'
import { classHighlighter, tags } from '@lezer/highlight'
import { syntaxHighlighting } from '@codemirror/language'
import { describe, expect, it } from 'vitest'
import {
  highlightRange,
  highlightSpans,
  highlightWith,
  languageForFence,
  languageForPath,
  setHighlightTheme
} from './codeHighlight'

describe('highlightSpans', () => {
  it('covers the whole text, with a class only on the highlighted spans', async () => {
    const code = 'const a = 1 // x'
    const support = await languageForFence('js')!.load()
    const spans = highlightSpans(code, support.language.parser.parse(code), classHighlighter)
    expect(spans.map((s) => s.text).join('')).toBe(code)
    expect(spans.find((s) => s.text === 'const')?.cls).toContain('tok-keyword')
    expect(spans.find((s) => s.text === '1')?.cls).toContain('tok-number')
    expect(spans.find((s) => s.text === ' ')?.cls).toBeNull()
  })
  it('with a range covers only the span, highlighted with the context of the whole file', async () => {
    const code = '/* a\nb */ const x = 1'
    const support = await languageForFence('js')!.load()
    const start = code.indexOf('b')
    const spans = highlightSpans(code, support.language.parser.parse(code), classHighlighter, start, code.length)
    expect(spans.map((s) => s.text).join('')).toBe(code.slice(start))
    expect(spans[0]?.cls).toContain('tok-comment')
  })
})

describe('highlightRange', () => {
  it('without a language returns the span without color', () => {
    expect(highlightRange('abc def', null, 4, 7)).toEqual([{ text: 'def', cls: null }])
  })
})

describe('languageForFence / languageForPath', () => {
  it('resolves name, alias and extension', () => {
    expect(languageForFence('typescript')?.name).toBe('TypeScript')
    expect(languageForFence('ts')?.name).toBe('TypeScript')
    expect(languageForFence('tsx')?.name).toBe('TSX')
    expect(languageForFence('js title=x')?.name).toBe('JavaScript')
    expect(languageForFence('nao-existe')).toBeNull()
    expect(languageForFence('')).toBeNull()
  })

  it('uses the file language when the fence does not say', () => {
    expect(languageForPath('/a/b.tsx')?.name).toBe('TSX')
    expect(languageForPath(undefined)).toBeNull()
  })
})

describe('highlightWith', () => {
  it('only highlights after the parser loads and uses the theme classes', async () => {
    const style = HighlightStyle.define([{ tag: tags.keyword, color: 'red' }])
    setHighlightTheme(syntaxHighlighting(style))
    const desc = languageForFence('ts')!
    if (!desc.support) expect(highlightWith('const a', desc)).toBeNull()
    await desc.load()
    const spans = highlightWith('const a', desc)!
    expect(spans.find((s) => s.text === 'const')?.cls).toBe(style.style([tags.keyword]))
  })
})
