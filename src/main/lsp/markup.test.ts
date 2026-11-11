import { describe, expect, it } from 'vitest'
import { MARKUP_LIMIT, normalizeHover, normalizeMarkup } from './markup'

describe('normalizeMarkup', () => {
  it('MarkupContent keeps the kind', () => {
    expect(normalizeMarkup({ kind: 'markdown', value: '**a**' })).toEqual({ kind: 'markdown', value: '**a**' })
    expect(normalizeMarkup({ kind: 'plaintext', value: 'a' })).toEqual({ kind: 'plaintext', value: 'a' })
  })

  it('a bare string is markdown (hover) or plain text (documentation)', () => {
    expect(normalizeMarkup('x')).toEqual({ kind: 'markdown', value: 'x' })
    expect(normalizeMarkup('x', true)).toEqual({ kind: 'plaintext', value: 'x' })
  })

  it('MarkedString { language, value } becomes a code block', () => {
    expect(normalizeMarkup({ language: 'ts', value: 'const a = 1' })).toEqual({
      kind: 'markdown',
      value: '```ts\nconst a = 1\n```'
    })
  })

  it('the fence grows when the code has backticks', () => {
    const md = normalizeMarkup({ language: 'md', value: 'a ``` b' })!.value
    expect(md.startsWith('````md\n')).toBe(true)
    expect(md.endsWith('\n````')).toBe(true)
  })

  it('array joins the parts, ignoring empty and malformed ones', () => {
    expect(normalizeMarkup([{ language: 'ts', value: 'x' }, '', 42, 'text'])).toEqual({
      kind: 'markdown',
      value: '```ts\nx\n```\n\ntext'
    })
  })

  it('empty or invalid becomes null', () => {
    expect(normalizeMarkup('   ')).toBeNull()
    expect(normalizeMarkup([])).toBeNull()
    expect(normalizeMarkup(null)).toBeNull()
    expect(normalizeMarkup({ kind: 'markdown', value: 3 })).toBeNull()
  })

  it('truncates huge documentation', () => {
    expect(normalizeMarkup('a'.repeat(MARKUP_LIMIT + 10))!.value).toHaveLength(MARKUP_LIMIT)
  })
})

describe('normalizeHover', () => {
  it('carries the range when valid', () => {
    const range = { start: { line: 1, character: 2 }, end: { line: 1, character: 5 } }
    expect(normalizeHover({ contents: 'x', range })).toEqual({ contents: { kind: 'markdown', value: 'x' }, range })
  })

  it('ignores an invalid range and an empty hover', () => {
    expect(normalizeHover({ contents: 'x', range: { start: { line: -1, character: 0 } } })).toEqual({
      contents: { kind: 'markdown', value: 'x' }
    })
    expect(normalizeHover({ contents: '' })).toBeNull()
    expect(normalizeHover(null)).toBeNull()
  })
})
