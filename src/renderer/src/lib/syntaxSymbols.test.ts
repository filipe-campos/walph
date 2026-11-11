import { describe, expect, it } from 'vitest'
import { EditorState, type Extension } from '@codemirror/state'
import { ensureSyntaxTree, LanguageDescription, syntaxTree } from '@codemirror/language'
import type { LspDocumentSymbol } from '@shared/types'
import { languages } from './language'
import { syntaxSymbols } from './syntaxSymbols'

/** Language of the file `x.<ext>` by the same registry as the editor (loaded on demand). */
async function lang(ext: string): Promise<Extension> {
  const description = LanguageDescription.matchFilename(languages, `x.${ext}`)
  if (!description) throw new Error(ext)
  return description.load()
}

function symbolsOf(doc: string, language: Extension): LspDocumentSymbol[] {
  const state = EditorState.create({ doc, extensions: language })
  // The parser may stop before the end even with a loose deadline (loaded machine): insists until it covers the text.
  for (let i = 0; i < 20 && syntaxTree(state).length < doc.length; i++) ensureSyntaxTree(state, doc.length, 5000)
  return syntaxSymbols(state)
}

/** `name:kind` with the children in brackets, to compare the shape of the tree. */
const shape = (nodes: LspDocumentSymbol[]): unknown[] =>
  nodes.map((n) => (n.children.length ? [`${n.name}:${n.kind}`, shape(n.children)] : `${n.name}:${n.kind}`))

describe('syntaxSymbols', () => {
  it('TypeScript: classes, members, functions, types and top-level variables; function locals are left out', async () => {
    const doc = [
      'export class A {',
      '  x = 1',
      '  m(a) { const y = 2 }',
      '}',
      'interface I { a: string; f(): void }',
      'type T = string',
      'enum E { A }',
      'const f = () => 1',
      'let v = 2',
      'function h() { function inner() {} const local = 1 }'
    ].join('\n')
    expect(shape(symbolsOf(doc, await lang('ts')))).toEqual([
      ['A:5', ['x:7', 'm:6']],
      ['I:11', ['a:7', 'f:6']],
      'T:26',
      'E:10',
      'f:12',
      'v:13',
      ['h:12', ['inner:12']]
    ])
  })

  it('the range covers the declaration and the selection, the name', async () => {
    const [a] = symbolsOf('class A {\n  m() {}\n}', await lang('js'))
    expect(a.range).toEqual({ start: { line: 0, character: 0 }, end: { line: 2, character: 1 } })
    expect(a.selectionRange).toEqual({ start: { line: 0, character: 6 }, end: { line: 0, character: 7 } })
  })

  it('object properties only inside a variable', async () => {
    expect(shape(symbolsOf('const o = { p: 1, q() {} }\ncall({ z: 1 })', await lang('js')))).toEqual([
      ['o:14', ['p:16', 'q:6']]
    ])
  })

  it('Python: def inside a class becomes a method', async () => {
    const doc = 'class A:\n    x = 1\n    def m(self):\n        y = 2\n\ndef f():\n    pass\n'
    expect(shape(symbolsOf(doc, await lang('py')))).toEqual([['A:5', ['x:13', 'm:6']], 'f:12'])
  })

  it('Rust: impl uses the header as the name', async () => {
    const doc = 'struct S { a: i32 }\nimpl S { fn n() {} }\nmod m { fn a() {} }'
    expect(shape(symbolsOf(doc, await lang('rs')))).toEqual([
      ['S:23', ['a:8']],
      ['impl S:5', ['n:12']],
      ['m:2', ['a:12']]
    ])
  })

  it('C++: the name comes from the declarator, not from the return type', async () => {
    const doc = 'Foo make() { return Foo(); }\nstruct S { Foo bar; void m(); };'
    expect(shape(symbolsOf(doc, await lang('cpp')))).toEqual(['make:12', ['S:23', ['bar:8', 'm:6']]])
  })

  it('JSON: nested keys with the value type', async () => {
    expect(shape(symbolsOf('{"a": {"b": [1]}, "c": "x", "d": true, "e": null}', await lang('json')))).toEqual([
      ['a:2', ['b:18']],
      'c:15',
      'd:17',
      'e:21'
    ])
  })

  it('CSS: selectors and @media by the header text', async () => {
    expect(shape(symbolsOf('a .b, c { color: red }\n@media (x) { e { a: b } }', await lang('css')))).toEqual([
      'a .b, c:5',
      ['@media (x):2', ['e:5']]
    ])
  })

  it('Markdown: headings nested by level; the section runs until the next heading of an equal or lower level', async () => {
    const doc = '# One\n\ntext\n\n## Two ##\n\nThree\n---\n\n# Four\n'
    const symbols = symbolsOf(doc, await lang('md'))
    expect(shape(symbols)).toEqual([['One:15', ['Two:15', 'Three:15']], 'Four:15'])
    expect(symbols[0].range.end.line).toBe(8)
    expect(symbols[1].range.end.line).toBe(10)
  })

  it('without a language there are no symbols', async () => {
    expect(symbolsOf('class A {}', [])).toEqual([])
  })
})
