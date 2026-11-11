import { LanguageDescription, ensureSyntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { classHighlighter, highlightTree } from '@lezer/highlight'
import { describe, expect, it } from 'vitest'
import { dotenvLanguage } from './dotenvLanguage'

type Token = [text: string, kind: string]

const KINDS: [string, string][] = [
  ['tok-comment', 'comment'],
  ['tok-keyword', 'keyword'],
  ['tok-propertyName', 'property'],
  ['tok-operator', 'operator'],
  ['tok-string', 'string'],
  ['tok-variableName', 'variavel']
]

async function tokens(text: string): Promise<Token[]> {
  const support = await dotenvLanguage.load()
  const state = EditorState.create({ doc: text, extensions: [support] })
  const doc = state.doc.toString()
  const tree = ensureSyntaxTree(state, doc.length, 1000)!
  const out: Token[] = []
  highlightTree(tree, classHighlighter, (from, to, classes) => {
    const kind = KINDS.find(([cls]) => classes.includes(cls))?.[1] ?? classes
    out.push([doc.slice(from, to), kind])
  })
  return out
}

describe('.env file recognition', () => {
  it.each(['.env', '.env.local', '.env.example', '.env.production.local', 'producao.env'])(
    'picks the dotenv mode for %s',
    (name) => {
      expect(LanguageDescription.matchFilename([dotenvLanguage], name)).toBe(dotenvLanguage)
    }
  )

  it.each(['env.ts', 'my.env.json', '.envrc', 'environment', 'x.dotenv'])(
    'does not pick the dotenv mode for %s',
    (name) => {
      expect(LanguageDescription.matchFilename([dotenvLanguage], name)).toBeNull()
    }
  )

  it('answers to the env and dotenv aliases', () => {
    expect(LanguageDescription.matchLanguageName([dotenvLanguage], 'dotenv')).toBe(dotenvLanguage)
    expect(LanguageDescription.matchLanguageName([dotenvLanguage], 'env')).toBe(dotenvLanguage)
  })
})

describe('.env highlighting', () => {
  it('key, equals and unquoted value', async () => {
    expect(await tokens('PORT=3000')).toEqual([
      ['PORT', 'property'],
      ['=', 'operator'],
      ['3000', 'string']
    ])
  })

  it('export becomes a keyword only when followed by a space; without a space it is a key', async () => {
    expect(await tokens('export KEY=1')).toEqual([
      ['export', 'keyword'],
      ['KEY', 'property'],
      ['=', 'operator'],
      ['1', 'string']
    ])
    expect(await tokens('exportar=1')).toEqual([
      ['exportar', 'property'],
      ['=', 'operator'],
      ['1', 'string']
    ])
  })

  it('whole-line comment, even with indentation', async () => {
    expect(await tokens('# note = 1\n  # other')).toEqual([
      ['# note = 1', 'comment'],
      ['# other', 'comment']
    ])
  })

  it('a comment after the value only starts after a space', async () => {
    expect(await tokens('A=1 # nota')).toEqual([
      ['A', 'property'],
      ['=', 'operator'],
      ['1', 'string'],
      ['# nota', 'comment']
    ])
    expect(await tokens('URL=http://x/#frag')).toEqual([
      ['URL', 'property'],
      ['=', 'operator'],
      ['http://x/#frag', 'string']
    ])
  })

  it('line without equals: the text becomes a key and the rest is ignored', async () => {
    expect(await tokens('SOZINHA')).toEqual([['SOZINHA', 'property']])
    expect(await tokens('=')).toEqual([['=', 'operator']])
  })

  it('a line that starts with equals has an empty key and the next line starts over as a key', async () => {
    expect(await tokens('=B\nC=1')).toEqual([
      ['=', 'operator'],
      ['B', 'string'],
      ['C', 'property'],
      ['=', 'operator'],
      ['1', 'string']
    ])
  })

  it('a value in double or single quotes is a single string', async () => {
    expect(await tokens('A="hello world"\nB=\'x y\'')).toEqual([
      ['A', 'property'],
      ['=', 'operator'],
      ['"hello world"', 'string'],
      ['B', 'property'],
      ['=', 'operator'],
      ["'x y'", 'string']
    ])
  })

  it('# inside quotes is not a comment', async () => {
    const result = await tokens('A="x # y"')
    expect(result.at(-1)).toEqual(['"x # y"', 'string'])
  })

  it('a quoted value can span several lines', async () => {
    const result = await tokens('KEY="line 1\nline 2"\nOTHER=1')
    expect(result).toEqual([
      ['KEY', 'property'],
      ['=', 'operator'],
      ['"line 1', 'string'],
      ['line 2"', 'string'],
      ['OTHER', 'property'],
      ['=', 'operator'],
      ['1', 'string']
    ])
  })

  it('unclosed quotes run to the end of the text as a string', async () => {
    const result = await tokens('A="aberta\nB=2')
    expect(result.map(([, kind]) => kind)).toEqual(['property', 'operator', 'string', 'string'])
  })

  it('a backslash escapes the quote inside double quotes', async () => {
    expect((await tokens('A="a\\" # c"')).slice(2)).toEqual([['"a\\" # c"', 'string']])
  })

  it('in single quotes the backslash does not escape: the quote closes and what comes after is a comment', async () => {
    expect((await tokens("A='a\\' # c")).slice(2)).toEqual([
      ["'a\\'", 'string'],
      ['# c', 'comment']
    ])
  })

  it('${VAR} and $VAR interpolation outside quotes', async () => {
    expect(await tokens('A=${B}/x/$C')).toEqual([
      ['A', 'property'],
      ['=', 'operator'],
      ['${B}', 'variavel'],
      ['/x/', 'string'],
      ['$C', 'variavel']
    ])
  })

  it('interpolation inside double quotes is highlighted; inside single quotes it is not', async () => {
    expect(await tokens('A="x ${B} y"')).toEqual([
      ['A', 'property'],
      ['=', 'operator'],
      ['"x ', 'string'],
      ['${B}', 'variavel'],
      [' y"', 'string']
    ])
    expect((await tokens("A='${B}'")).slice(2)).toEqual([["'${B}'", 'string']])
  })

  it('interpolation right after the opening quote: the variable ends before the closing quote', async () => {
    const result = (await tokens('A="$B"')).slice(2)
    expect(result.at(-1)).toEqual(['"', 'string'])
    expect(result[0][1]).toBe('variavel')
    expect(result[0][0]).toContain('$B')
  })

  it('${ unclosed on the line runs to the end; a lone $ is plain text', async () => {
    expect((await tokens('A=${B')).slice(2)).toEqual([['${B', 'variavel']])
    expect((await tokens('A=5$ 6')).slice(2)).toEqual([['5$ 6', 'string']])
  })

  it('blank lines and CRLF do not produce extra marks', async () => {
    const result = await tokens('A=1\r\n\r\nB=2\r\n')
    expect(result.filter(([, kind]) => kind === 'property').map(([text]) => text)).toEqual(['A', 'B'])
  })

  it('the value state starts over on each line', async () => {
    const result = await tokens('A=1\nB')
    expect(result.at(-1)).toEqual(['B', 'property'])
  })
})
