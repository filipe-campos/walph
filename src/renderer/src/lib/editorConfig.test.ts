import { describe, expect, it } from 'vitest'
import {
  compileSectionGlob,
  editorConfigIndent,
  editorConfigRulers,
  matchesSection,
  parseEditorConfig,
  resolveEditorConfig,
  type EditorConfigSource
} from './editorConfig'

const matches = (section: string, relative: string): boolean => matchesSection(compileSectionGlob(section), relative)

describe('section globs', () => {
  it('without a slash matches the name in any folder', () => {
    expect(matches('*', 'a.ts')).toBe(true)
    expect(matches('*', 'src/deep/a.ts')).toBe(true)
    expect(matches('*.js', 'src/a.js')).toBe(true)
    expect(matches('*.js', 'src/a.ts')).toBe(false)
    expect(matches('Makefile', 'Makefile')).toBe(true)
    expect(matches('Makefile', 'sub/Makefile')).toBe(true)
    expect(matches('Makefile', 'Makefile.am')).toBe(false)
  })

  it('braces with alternatives, including nested ones', () => {
    expect(matches('*.{js,ts}', 'a.js')).toBe(true)
    expect(matches('*.{js,ts}', 'lib/a.ts')).toBe(true)
    expect(matches('*.{js,ts}', 'a.tsx')).toBe(false)
    expect(matches('{package.json,*.{yml,yaml}}', 'ci/a.yaml')).toBe(true)
    expect(matches('{package.json,*.{yml,yaml}}', 'package.json')).toBe(true)
    expect(matches('{single}', '{single}')).toBe(true)
    expect(matches('{single}', 'single')).toBe(false)
  })

  it('with a slash it is relative to the .editorconfig folder; ** crosses folders', () => {
    expect(matches('lib/**.js', 'lib/a.js')).toBe(true)
    expect(matches('lib/**.js', 'lib/x/y/a.js')).toBe(true)
    expect(matches('lib/**.js', 'src/lib/a.js')).toBe(false)
    expect(matches('/root.txt', 'root.txt')).toBe(true)
    expect(matches('/root.txt', 'sub/root.txt')).toBe(false)
    expect(matches('a/**/b.txt', 'a/b.txt')).toBe(true)
    expect(matches('a/**/b.txt', 'a/x/y/b.txt')).toBe(true)
    expect(matches('src/*.ts', 'src/x/a.ts')).toBe(false)
  })

  it('?, classes and numeric ranges', () => {
    expect(matches('?.c', 'a.c')).toBe(true)
    expect(matches('?.c', 'ab.c')).toBe(false)
    expect(matches('[ab].c', 'b.c')).toBe(true)
    expect(matches('[!ab].c', 'b.c')).toBe(false)
    expect(matches('[!ab].c', 'c.c')).toBe(true)
    expect(matches('file{1..3}.txt', 'file2.txt')).toBe(true)
    expect(matches('file{1..3}.txt', 'file4.txt')).toBe(false)
    expect(matches('file{-1..1}.txt', 'file-1.txt')).toBe(true)
  })

  it('escapes and regex special characters are literal', () => {
    expect(matches('a\\*.txt', 'a*.txt')).toBe(true)
    expect(matches('a\\*.txt', 'ab.txt')).toBe(false)
    expect(matches('a+b.(x)', 'a+b.(x)')).toBe(true)
    expect(matches('[unclosed', '[unclosed')).toBe(true)
  })
})

describe('parseEditorConfig', () => {
  it('reads root, sections and properties; ignores comments and invalid lines', () => {
    const file = parseEditorConfig(
      [
        '# topo',
        'root = TRUE',
        '',
        '[*]',
        'indent_style = Space',
        '; other',
        'garbage',
        '[*.md]',
        'Trim_Trailing_Whitespace = false'
      ].join('\r\n')
    )
    expect(file.root).toBe(true)
    expect(file.sections).toHaveLength(2)
    expect(file.sections[0]?.props).toEqual({ indent_style: 'space' })
    expect(file.sections[1]?.props).toEqual({ trim_trailing_whitespace: 'false' })
  })

  it('root outside the preamble does not count', () => {
    expect(parseEditorConfig('[*]\nroot = true').root).toBe(false)
  })

  it('values of unknown keys keep their case', () => {
    expect(parseEditorConfig('[*]\nCustom = AbC').sections[0]?.props).toEqual({ custom: 'AbC' })
  })
})

const source = (dir: string, text: string): EditorConfigSource => ({ dir, file: parseEditorConfig(text) })

describe('resolveEditorConfig', () => {
  it('the closest wins; within the file, the last section wins', () => {
    const props = resolveEditorConfig('/p/src/a.ts', [
      source('/p/src', '[*.ts]\nindent_size = 4'),
      source(
        '/p',
        '[*]\nindent_style = space\nindent_size = 2\n[*.ts]\nmax_line_length = 100\n[a.ts]\nmax_line_length = 80'
      )
    ])
    expect(props).toEqual({ indentStyle: 'space', indentSize: 4, tabWidth: 4, maxLineLength: 80 })
  })

  it('unset erases the inherited value', () => {
    const props = resolveEditorConfig('/p/a.js', [
      source('/p', '[*]\ninsert_final_newline = true\n[*.js]\ninsert_final_newline = unset')
    ])
    expect(props.insertFinalNewline).toBeUndefined()
  })

  it('converts EOL, charset and booleans; ignores values outside the specification', () => {
    const props = resolveEditorConfig('/p/a.txt', [
      source(
        '/p',
        '[*]\nend_of_line = crlf\ncharset = latin1\ntrim_trailing_whitespace = true\ninsert_final_newline = false\nmax_line_length = off'
      )
    ])
    expect(props).toEqual({
      endOfLine: 'CRLF',
      encoding: 'iso88591',
      trimTrailingWhitespace: true,
      insertFinalNewline: false
    })
    expect(resolveEditorConfig('/p/a', [source('/p', '[*]\nend_of_line = cr\nindent_size = -2')])).toEqual({})
  })

  it('indent_style = tab without a size uses tab_width', () => {
    const props = resolveEditorConfig('/p/Makefile', [source('/p', '[Makefile]\nindent_style = tab\ntab_width = 8')])
    expect(props).toEqual({ indentStyle: 'tab', indentSize: 'tab', tabWidth: 8 })
  })

  it('a file outside the .editorconfig folder is not affected; Windows paths work', () => {
    expect(resolveEditorConfig('/q/a.ts', [source('/p', '[*]\nindent_size = 3')])).toEqual({})
    expect(resolveEditorConfig('C:\\p\\src\\a.ts', [source('C:\\p', '[src/*.ts]\nindent_size = 3')])).toEqual({
      indentSize: 3,
      tabWidth: 3
    })
  })
})

describe('editorConfigIndent', () => {
  it('without indentation properties returns null', () => {
    expect(editorConfigIndent({ kind: 'spaces', size: 2 }, { maxLineLength: 80 }, 4)).toBeNull()
  })

  it('EditorConfig style and size win over the detected ones', () => {
    expect(editorConfigIndent({ kind: 'tabs' }, { indentStyle: 'space', indentSize: 4, tabWidth: 4 }, 2)).toEqual({
      kind: 'spaces',
      size: 4
    })
    expect(
      editorConfigIndent({ kind: 'spaces', size: 2 }, { indentStyle: 'tab', indentSize: 'tab', tabWidth: 8 }, 2)
    ).toEqual({
      kind: 'tabs',
      width: 8
    })
  })

  it('only the size keeps the detected kind', () => {
    expect(editorConfigIndent({ kind: 'spaces', size: 2 }, { indentSize: 4, tabWidth: 4 }, 2)).toEqual({
      kind: 'spaces',
      size: 4
    })
    expect(editorConfigIndent({ kind: 'tabs' }, { indentSize: 3, tabWidth: 3 }, 2)).toEqual({ kind: 'tabs', width: 3 })
  })

  it('spaces without a size in a file with tabs use the default', () => {
    expect(editorConfigIndent({ kind: 'tabs' }, { indentStyle: 'space' }, 4)).toEqual({ kind: 'spaces', size: 4 })
  })
})

describe('editorConfigRulers', () => {
  it('max_line_length becomes a ruler', () => {
    expect(editorConfigRulers({ maxLineLength: 100 })).toEqual([100])
    expect(editorConfigRulers({})).toEqual([])
  })
})
