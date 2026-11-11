import { describe, expect, it } from 'vitest'
import {
  emmetSyntaxFor,
  expandAbbreviation,
  extractAbbreviation,
  isLikelyAbbreviation,
  startsWithElement
} from './emmet'

const html = { type: 'markup', syntax: 'html' } as const
const jsx = { type: 'markup', syntax: 'jsx' } as const
const css = { type: 'stylesheet', syntax: 'css' } as const

describe('emmetSyntaxFor', () => {
  it('markup, JSX and style sheets', () => {
    expect(emmetSyntaxFor('html')).toEqual(html)
    expect(emmetSyntaxFor('vue')).toEqual(html)
    expect(emmetSyntaxFor('typescriptreact')).toEqual(jsx)
    expect(emmetSyntaxFor('scss')).toEqual({ type: 'stylesheet', syntax: 'scss' })
    expect(emmetSyntaxFor('typescript')).toBeNull()
  })

  it('`emmet.includeLanguages` maps other languages', () => {
    expect(emmetSyntaxFor('php', { php: 'html' })).toEqual(html)
    expect(emmetSyntaxFor('javascript', { javascript: 'javascriptreact' })).toEqual(jsx)
    expect(emmetSyntaxFor('constructor', {})).toBeNull()
  })
})

describe('extractAbbreviation', () => {
  it('takes the abbreviation that ends at the cursor', () => {
    expect(extractAbbreviation('  <p>ul>li*2', 12, 'markup')).toEqual({ abbreviation: 'ul>li*2', start: 5, end: 12 })
    expect(extractAbbreviation('foo bar', 3, 'markup')).toEqual({ abbreviation: 'foo', start: 0, end: 3 })
  })

  it('includes the auto-close right after the cursor', () => {
    expect(extractAbbreviation('a[href]', 6, 'markup')).toEqual({ abbreviation: 'a[href]', start: 0, end: 7 })
  })

  it('nothing before the cursor', () => {
    expect(extractAbbreviation('   ', 3, 'markup')).toBeNull()
  })
})

describe('isLikelyAbbreviation', () => {
  it('a lone word only if it is a known tag or snippet', () => {
    expect(isLikelyAbbreviation('div', html)).toBe(true)
    expect(isLikelyAbbreviation('inp', html)).toBe(true)
    expect(isLikelyAbbreviation('foo', html)).toBe(false)
    expect(isLikelyAbbreviation('Foo', jsx)).toBe(false)
  })

  it('with Emmet operators', () => {
    expect(isLikelyAbbreviation('ul>li*3', html)).toBe(true)
    expect(isLikelyAbbreviation('.card', html)).toBe(true)
    expect(isLikelyAbbreviation('Foo.bar', jsx)).toBe(true)
    expect(isLikelyAbbreviation('!', html)).toBe(true)
  })

  it('in CSS, abbreviated words and values', () => {
    expect(isLikelyAbbreviation('m10', css)).toBe(true)
    expect(isLikelyAbbreviation('pos:a', css)).toBe(true)
    expect(isLikelyAbbreviation('10px', css)).toBe(false)
  })
})

describe('expandAbbreviation', () => {
  it('produces tabstops in the VS Code snippet syntax', () => {
    expect(expandAbbreviation('ul>li*2', html)).toBe('<ul>\n\t<li>${1}</li>\n\t<li>${2}</li>\n</ul>')
    expect(expandAbbreviation('div.a', jsx)).toBe('<div className="a">${1}</div>')
    expect(expandAbbreviation('m10', css)).toBe('margin: 10px;')
  })

  it('an unknown CSS property does not expand', () => {
    expect(expandAbbreviation('xyzw', css)).toBeNull()
  })

  it('wraps text, escaping the snippet syntax', () => {
    expect(expandAbbreviation('p', html, { text: 'custa $5 }' })).toBe('<p>custa \\$5 \\}</p>')
    expect(expandAbbreviation('ul>li*', html, { text: ['a', 'b'] })).toBe('<ul>\n\t<li>a</li>\n\t<li>b</li>\n</ul>')
  })
})

describe('startsWithElement', () => {
  it('HTML tag, component, class or id; not property access', () => {
    expect(startsWithElement('div.card')).toBe(true)
    expect(startsWithElement('Card>p')).toBe(true)
    expect(startsWithElement('.box')).toBe(true)
    expect(startsWithElement('x.id')).toBe(false)
    expect(startsWithElement('foo.bar')).toBe(false)
  })
})
