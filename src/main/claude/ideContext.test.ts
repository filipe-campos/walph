import { describe, expect, it } from 'vitest'
import { buildUserContent } from './buildPrompt'
import { contextOfTexts, parseIdeContext } from './ideContext'

describe('parseIdeContext', () => {
  it('selection: path and lines', () => {
    expect(
      parseIdeContext(
        '<ide_selection>The user selected lines 3 to 7 from /p/src/a.ts:\nconst x = 1\n\nThis may or may not be related to the current task.</ide_selection>'
      )
    ).toEqual({ path: '/p/src/a.ts', startLine: 3, endLine: 7 })
  })

  it('single-line selection and the official extension variant', () => {
    expect(
      parseIdeContext('<ide_selection>The user selected the lines 5 to 5 from /p/a b.ts:\nx</ide_selection>')
    ).toEqual({
      path: '/p/a b.ts',
      startLine: 5,
      endLine: 5
    })
  })

  it('opened file: only the path', () => {
    expect(
      parseIdeContext(
        '<ide_opened_file>The user opened the file /p/src/a.ts in the IDE. This may or may not be related to the current task.</ide_opened_file>'
      )
    ).toEqual({ path: '/p/src/a.ts' })
  })

  it('plain text, unexpected format and invalid lines become null', () => {
    expect(parseIdeContext('hello')).toBeNull()
    expect(parseIdeContext('<ide_opened_file>something else</ide_opened_file>')).toBeNull()
    expect(parseIdeContext('<ide_selection>The user selected lines 0 to 2 from /a:\nx</ide_selection>')).toBeNull()
  })
})

describe('contextOfTexts', () => {
  it('the selection beats the opened file, in any order', () => {
    const opened = '<ide_opened_file>The user opened the file /p/b.ts in the IDE.</ide_opened_file>'
    const selection = '<ide_selection>The user selected lines 1 to 2 from /p/a.ts:\nx</ide_selection>'
    expect(contextOfTexts([opened, selection])).toEqual({ path: '/p/a.ts', startLine: 1, endLine: 2 })
    expect(contextOfTexts([opened])).toEqual({ path: '/p/b.ts' })
    expect(contextOfTexts(['hi'])).toBeUndefined()
  })

  it('reads what buildUserContent injects', () => {
    const blocks = buildUserContent(
      {
        text: 'hi',
        attachments: [],
        images: [],
        activeFile: '/p/a.ts',
        selection: { path: '/p/a.ts', startLine: 4, endLine: 9, text: 'abc' }
      },
      []
    )
    const texts = blocks.flatMap((b) => (b.type === 'text' ? [b.text] : []))
    expect(contextOfTexts(texts)).toEqual({ path: '/p/a.ts', startLine: 4, endLine: 9 })
  })
})
