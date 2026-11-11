import { beforeAll, describe, expect, it, vi } from 'vitest'
import { isEmptyMarkup, markupToHtml, renderMarkup, splitMarkdownBlocks } from './lspMarkdown'
import { loadMarkdownLibs } from './markdownLibs'
import { installFakeApi } from '../test/fakeApi'

beforeAll(async () => {
  await loadMarkdownLibs()
})

describe('markupToHtml', () => {
  it('renders basic markdown', () => {
    const html = markupToHtml({ kind: 'markdown', value: '**bold** and `code`\n\n```ts\nconst a = 1\n```' })
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<code>code</code>')
    expect(html).toContain('<pre><code class="language-ts">const a = 1')
  })

  it('removes scripts, handlers and images', () => {
    const html = markupToHtml({
      kind: 'markdown',
      value: '<script>alert(1)</script><img src=x onerror=alert(1)><b onclick="x()">hi</b>'
    })
    expect(html).not.toMatch(/script|onerror|onclick|<img/i)
    expect(html).toContain('hi')
  })

  it('strips the href from links: none navigates the window', () => {
    const html = markupToHtml({ kind: 'markdown', value: '[doc](https://example.com/x) [bad](javascript:alert(1))' })
    expect(html).not.toMatch(/\shref=/)
    expect(html).toContain('data-href="https://example.com/x"')
    expect(html).not.toContain('javascript:')
  })

  it('strict mode: only language-* in class; no id, role, data-* and aria-*', () => {
    const html = markupToHtml(
      {
        kind: 'markdown',
        value:
          '<p id="x" role="button" class="claude-file-link evil" data-path="/etc/passwd" aria-label="a" tabindex="0">hi</p>\n\n```ts\nconst a = 1\n```'
      },
      { strict: true }
    )
    expect(html).not.toMatch(/\sid=|role=|claude-file-link|evil|data-path|aria-|tabindex/)
    expect(html).toContain('<code class="language-ts">')
    expect(html).toContain('hi')
  })

  it('strict mode keeps the external link and does not leak into normal mode', () => {
    const strict = markupToHtml({ kind: 'markdown', value: '[a](https://example.com/x)' }, { strict: true })
    expect(strict).toContain('data-href="https://example.com/x"')
    const normal = markupToHtml({ kind: 'markdown', value: '<span class="keep" id="y">z</span>' })
    expect(normal).toContain('class="keep"')
  })

  it('strict mode keeps the target of paths and file: in data-href, without a live href', () => {
    const html = markupToHtml(
      { kind: 'markdown', value: '[a](src/x.ts:10) [b](file:///w/p/y.ts#L3) [c](/etc/hosts) [d](javascript:alert(1))' },
      { strict: true }
    )
    expect(html).not.toMatch(/\shref=/)
    expect(html).toContain('data-href="src/x.ts:10"')
    expect(html).toContain('data-href="file:///w/p/y.ts#L3"')
    expect(html).toContain('data-href="/etc/hosts"')
    expect(html).not.toContain('javascript:')
  })

  it('normal mode only keeps http(s)', () => {
    const html = markupToHtml({ kind: 'markdown', value: '[a](src/x.ts) [b](https://example.com)' })
    expect(html).not.toContain('data-href="src/x.ts"')
    expect(html).toContain('data-href="https://example.com"')
  })

  it('bare URLs in the text become links (GFM autolink)', () => {
    const html = markupToHtml({ kind: 'markdown', value: 'see https://example.com/docs now' }, { strict: true })
    expect(html).toContain('data-href="https://example.com/docs"')
  })

  it('a data-href forged in the model HTML does not survive', () => {
    const html = markupToHtml({ kind: 'markdown', value: '<a data-href="https://evil.dev">x</a>' }, { strict: true })
    expect(html).not.toContain('data-href')
  })

  it('plain text is escaped', () => {
    const html = markupToHtml({ kind: 'plaintext', value: '<b>a</b> & b' })
    expect(html).toContain('&lt;b&gt;a&lt;/b&gt; &amp; b')
  })
})

describe('renderMarkup', () => {
  it('opens only http(s) links in the browser and cancels the navigation', () => {
    const open = vi.fn()
    installFakeApi({ window: { openExternal: open } })
    const el = renderMarkup({ kind: 'markdown', value: '[a](https://example.com) [b](file:///etc/passwd)' })
    document.body.append(el)
    const [a, b] = el.querySelectorAll('a')
    const clickA = new MouseEvent('click', { bubbles: true, cancelable: true })
    a.dispatchEvent(clickA)
    expect(clickA.defaultPrevented).toBe(true)
    expect(open).toHaveBeenCalledWith('https://example.com')
    open.mockClear()
    b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(open).not.toHaveBeenCalled()
    el.remove()
  })
})

describe('isEmptyMarkup', () => {
  it('detects empty documentation', () => {
    expect(isEmptyMarkup(undefined)).toBe(true)
    expect(isEmptyMarkup({ kind: 'markdown', value: ' \n' })).toBe(true)
    expect(isEmptyMarkup({ kind: 'markdown', value: 'x' })).toBe(false)
  })
})

describe('code highlighting', () => {
  it('paints the block with the theme classes, without interpreting the text as HTML', async () => {
    const { HighlightStyle, syntaxHighlighting } = await import('@codemirror/language')
    const { tags } = await import('@lezer/highlight')
    const { setHighlightTheme, languageForFence } = await import('./codeHighlight')
    const style = HighlightStyle.define([{ tag: tags.keyword, color: 'red' }])
    setHighlightTheme(syntaxHighlighting(style))
    await languageForFence('typescript')!.load()
    const el = renderMarkup({ kind: 'markdown', value: '```typescript\nconst a = "<b>x</b>"\n```' })
    const code = el.querySelector('pre > code')!
    expect(code.querySelector('.' + style.style([tags.keyword])!)?.textContent).toBe('const')
    expect(code.querySelector('b')).toBeNull()
    expect(code.textContent).toBe('const a = "<b>x</b>"\n')
  })

  it('without a language in the fence uses the file one; an unknown language stays plain text', async () => {
    const { HighlightStyle, syntaxHighlighting } = await import('@codemirror/language')
    const { tags } = await import('@lezer/highlight')
    const { setHighlightTheme, languageForFence } = await import('./codeHighlight')
    setHighlightTheme(syntaxHighlighting(HighlightStyle.define([{ tag: tags.keyword, color: 'red' }])))
    await languageForFence('ts')!.load()
    const withDefault = renderMarkup({ kind: 'markdown', value: '```\nconst a = 1\n```' }, '/x/a.ts')
    expect(withDefault.querySelector('pre > code span')).not.toBeNull()
    const unknown = renderMarkup({ kind: 'markdown', value: '```nothing\nconst a = 1\n```' }, '/x/a.ts')
    expect(unknown.querySelector('pre > code span')).toBeNull()
  })
})

describe('splitMarkdownBlocks', () => {
  it('closes all blocks but the last', () => {
    const { closed, tail } = splitMarkdownBlocks('# Title\n\nparagraph\n\n- a\n- b\n')
    expect(closed).toEqual(['# Title\n\n', 'paragraph\n\n'])
    expect(tail).toBe('- a\n- b\n')
  })

  it('an open code fence stays entirely in the tail', () => {
    const { closed, tail } = splitMarkdownBlocks('text\n\n```ts\nconst a = 1\n\nconst b')
    expect(closed).toEqual(['text\n\n'])
    expect(tail).toBe('```ts\nconst a = 1\n\nconst b')
  })

  it('joining the blocks returns the original text', () => {
    const text = 'a\n\n> quote\n\n```js\nx\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n'
    const { closed, tail } = splitMarkdownBlocks(text)
    expect([...closed, tail].join('')).toBe(text)
  })
})
