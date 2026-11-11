import { describe, expect, it } from 'vitest'
import type { ClaudePromptInput } from '@shared/types'
import {
  buildUserContent,
  clampText,
  isInjectedContext,
  MAX_ATTACHMENT_CHARS,
  MAX_DIRECTORY_ENTRIES,
  MAX_IMAGE_BASE64_CHARS,
  sliceLines
} from './buildPrompt'

const base: ClaudePromptInput = { text: 'hi', attachments: [], images: [], activeFile: null, selection: null }
const texts = (blocks: ReturnType<typeof buildUserContent>): string[] =>
  blocks.map((b) => (b.type === 'text' ? b.text : '[img]'))

describe('sliceLines', () => {
  const text = 'a\nb\nc\nd'
  it('inclusive range, 1-based', () => {
    expect(sliceLines(text, 2, 3)).toBe('b\nc')
    expect(sliceLines(text, 3)).toBe('c\nd')
    expect(sliceLines(text, undefined, 2)).toBe('a\nb')
  })
  it('clamps to the length and returns empty for an inverted range', () => {
    expect(sliceLines(text, 3, 99)).toBe('c\nd')
    expect(sliceLines(text, 4, 2)).toBe('')
    expect(sliceLines(text)).toBe(text)
  })
})

describe('clampText', () => {
  it('does not split a surrogate pair', () => {
    const r = clampText('ab😀', 3)
    expect(r.truncated).toBe(true)
    expect(r.text).toBe('ab')
  })
  it('keeps short text', () => {
    expect(clampText('abc', 3)).toEqual({ text: 'abc', truncated: false })
  })
})

describe('buildUserContent', () => {
  it('user text first, then attachments and context', () => {
    const blocks = buildUserContent(
      {
        ...base,
        activeFile: '/p/a.ts',
        selection: { path: '/p/b.ts', startLine: 3, endLine: 4, text: 'x\ny' }
      },
      [{ kind: 'file', path: '/p/c.ts', startLine: 10, endLine: 12, text: 'lines' }]
    )
    const t = texts(blocks)
    expect(t[0]).toBe('hi')
    expect(t[1]).toBe('<attached_file path="/p/c.ts" lines="10-12">\nlines\n</attached_file>')
    expect(t[2]).toContain('<ide_selection>The user selected lines 3 to 4 from /p/b.ts:\nx\ny')
    expect(t[3]).toContain('<ide_opened_file>The user opened the file /p/a.ts')
    expect(t.every((s, i) => i === 0 || isInjectedContext(s))).toBe(true)
  })

  it('a selection in the active file skips ide_opened_file', () => {
    const t = texts(
      buildUserContent(
        { ...base, activeFile: '/p/a.ts', selection: { path: '/p/a.ts', startLine: 1, endLine: 1, text: 'x' } },
        []
      )
    )
    expect(t).toHaveLength(2)
  })

  it('truncates a large attachment and lists a folder with a limit', () => {
    const [, file] = buildUserContent(base, [
      { kind: 'file', path: '/p/big', text: 'x'.repeat(MAX_ATTACHMENT_CHARS + 5) }
    ])
    expect(file.type === 'text' && file.text).toContain('file truncated')
    const entries = Array.from({ length: MAX_DIRECTORY_ENTRIES + 3 }, (_, i) => `f${i}`)
    const [, dir] = buildUserContent(base, [{ kind: 'directory', path: '/p/d', entries }])
    expect(dir.type === 'text' && dir.text).toContain('(+3 items)')
  })

  it('escapes quotes in the attribute path', () => {
    const [, a] = buildUserContent(base, [{ kind: 'unreadable', path: '/p/"x', reason: 'no access' }])
    expect(a.type === 'text' && a.text).toContain('path="/p/&quot;x"')
  })

  it('includes images and validates size/format', () => {
    const ok = buildUserContent({ ...base, images: [{ mediaType: 'image/png', data: 'AAAA' }] }, [])
    expect(ok[ok.length - 1]).toMatchObject({ type: 'image', source: { media_type: 'image/png' } })
    expect(() =>
      buildUserContent(
        { ...base, images: [{ mediaType: 'image/png', data: 'A'.repeat(MAX_IMAGE_BASE64_CHARS + 1) }] },
        []
      )
    ).toThrow('5 MB')
    expect(() => buildUserContent({ ...base, images: [{ mediaType: 'image/png', data: '<script>' }] }, [])).toThrow()
    const many = Array.from({ length: 9 }, () => ({ mediaType: 'image/png' as const, data: 'AAAA' }))
    expect(() => buildUserContent({ ...base, images: many }, [])).toThrow('No máximo')
  })

  it('rejects a message with nothing but the automatic context', () => {
    expect(() => buildUserContent({ ...base, text: '  ', activeFile: '/p/a.ts' }, [])).toThrow('vazia')
    expect(buildUserContent({ ...base, text: '  ' }, [{ kind: 'directory', path: '/d', entries: [] }])).toHaveLength(1)
  })
})

describe('buildUserContent - attachments and selection (gaps)', () => {
  it('a file attachment with a range carries lines in the attribute; unreadable warns Claude', () => {
    const t = texts(
      buildUserContent(base, [
        { kind: 'file', path: '/p/a.ts', startLine: 10, endLine: 20, text: 'body' },
        { kind: 'file', path: '/p/b.ts', startLine: 5, text: 'rest' },
        { kind: 'unreadable', path: '/p/c.bin', reason: 'Binary file.' }
      ])
    )
    expect(t[1]).toBe('<attached_file path="/p/a.ts" lines="10-20">\nbody\n</attached_file>')
    expect(t[2]).toContain('lines="5-"')
    expect(t[3]).toBe('<attached_unreadable path="/p/c.bin">Binary file.</attached_unreadable>')
  })

  it('only an attachment, without typed text, is a valid message (no empty text block)', () => {
    const blocks = buildUserContent({ ...base, text: '   ' }, [{ kind: 'file', path: '/p/a.ts', text: 'x' }])
    expect(blocks).toHaveLength(1)
    expect(texts(blocks)[0]).toContain('<attached_file')
  })

  it('a selection in another file also keeps ide_opened_file', () => {
    const t = texts(
      buildUserContent(
        { ...base, activeFile: '/p/b.ts', selection: { path: '/p/a.ts', startLine: 3, endLine: 4, text: 'sel' } },
        []
      )
    )
    expect(t).toHaveLength(3)
    expect(t[1]).toContain('lines 3 to 4 from /p/a.ts')
    expect(t[2]).toContain('<ide_opened_file>')
  })

  it('an empty selection yields no block and the active file is included', () => {
    const t = texts(
      buildUserContent(
        { ...base, activeFile: '/p/a.ts', selection: { path: '/p/a.ts', startLine: 1, endLine: 1, text: '' } },
        []
      )
    )
    expect(t).toHaveLength(2)
    expect(t[1]).toContain('<ide_opened_file>')
  })

  it('a huge selection is cut and UTF-8 multibyte/CRLF pass intact', () => {
    const text = 'é😀\r\n'.repeat(20_000)
    const blocks = buildUserContent({ ...base, selection: { path: '/p/a.ts', startLine: 1, endLine: 2, text } }, [])
    const sel = blocks[1].type === 'text' ? blocks[1].text : ''
    expect(sel.length).toBeLessThan(text.length)
    expect(sel).toContain('é😀\r\n')
    // No lone surrogate at the cut.
    expect(sel).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/)
  })
})
