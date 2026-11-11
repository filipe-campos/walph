import { describe, expect, it } from 'vitest'
import { snippetVariable, type SnippetContext } from './snippetVariables'

const ctx = (patch: Partial<SnippetContext> = {}): SnippetContext => ({
  filePath: '/repo/src/comp.test.tsx',
  root: '/repo',
  selectedText: 'sel',
  currentLine: '  const a = 1',
  currentWord: 'const',
  lineIndex: 4,
  clipboard: 'clip',
  lineComment: '//',
  blockComment: { open: '/*', close: '*/' },
  now: new Date(2026, 0, 5, 7, 8, 9),
  random: () => 0.5,
  uuid: () => 'uuid-1',
  ...patch
})

describe('snippetVariable', () => {
  it('file and folder', () => {
    const c = ctx()
    expect(snippetVariable('TM_FILENAME', c)).toBe('comp.test.tsx')
    expect(snippetVariable('TM_FILENAME_BASE', c)).toBe('comp.test')
    expect(snippetVariable('TM_DIRECTORY', c)).toBe('/repo/src')
    expect(snippetVariable('TM_FILEPATH', c)).toBe('/repo/src/comp.test.tsx')
    expect(snippetVariable('RELATIVE_FILEPATH', c)).toBe('src/comp.test.tsx')
    expect(snippetVariable('WORKSPACE_NAME', c)).toBe('repo')
    expect(snippetVariable('WORKSPACE_FOLDER', c)).toBe('/repo')
  })

  it('without a file or folder the variables are empty (known)', () => {
    const c = ctx({ filePath: null, root: null })
    expect(snippetVariable('TM_FILENAME', c)).toBe('')
    expect(snippetVariable('RELATIVE_FILEPATH', c)).toBe('')
    expect(snippetVariable('WORKSPACE_NAME', c)).toBe('')
  })

  it('editor and clipboard', () => {
    const c = ctx()
    expect(snippetVariable('TM_SELECTED_TEXT', c)).toBe('sel')
    expect(snippetVariable('TM_CURRENT_LINE', c)).toBe('  const a = 1')
    expect(snippetVariable('TM_CURRENT_WORD', c)).toBe('const')
    expect(snippetVariable('TM_LINE_INDEX', c)).toBe('4')
    expect(snippetVariable('TM_LINE_NUMBER', c)).toBe('5')
    expect(snippetVariable('CLIPBOARD', c)).toBe('clip')
  })

  it('dates with a leading zero', () => {
    const c = ctx()
    expect(snippetVariable('CURRENT_YEAR', c)).toBe('2026')
    expect(snippetVariable('CURRENT_YEAR_SHORT', c)).toBe('26')
    expect(snippetVariable('CURRENT_MONTH', c)).toBe('01')
    expect(snippetVariable('CURRENT_DATE', c)).toBe('05')
    expect(snippetVariable('CURRENT_HOUR', c)).toBe('07')
    expect(snippetVariable('CURRENT_MINUTE', c)).toBe('08')
    expect(snippetVariable('CURRENT_SECOND', c)).toBe('09')
    expect(snippetVariable('CURRENT_MONTH_NAME', c)).toMatch(/janeiro/i)
  })

  it('random values and UUID come from the context', () => {
    const c = ctx()
    expect(snippetVariable('RANDOM', c)).toBe('555555')
    expect(snippetVariable('RANDOM_HEX', c)).toBe('888888')
    expect(snippetVariable('UUID', c)).toBe('uuid-1')
  })

  it('comments: without the line one, LINE_COMMENT uses the block opening', () => {
    expect(snippetVariable('LINE_COMMENT', ctx())).toBe('//')
    expect(snippetVariable('LINE_COMMENT', ctx({ lineComment: undefined }))).toBe('/*')
    expect(snippetVariable('BLOCK_COMMENT_START', ctx())).toBe('/*')
    expect(snippetVariable('BLOCK_COMMENT_END', ctx())).toBe('*/')
  })

  it('an unknown variable is `undefined`', () => {
    expect(snippetVariable('NAO_EXISTE', ctx())).toBeUndefined()
  })
})
