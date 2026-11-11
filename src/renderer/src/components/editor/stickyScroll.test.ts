import { beforeAll, describe, expect, it } from 'vitest'
import { EditorState, type Extension } from '@codemirror/state'
import { ensureSyntaxTree, LanguageDescription } from '@codemirror/language'
import { languages } from '../../lib/language'
import { stickyLines } from '../../lib/stickyScroll'
import { scopesAt } from './stickyScroll'

function stateOf(lines: string[], language: Extension): EditorState {
  const state = EditorState.create({ doc: lines.join('\n'), extensions: language })
  ensureSyntaxTree(state, state.doc.length, 5000)
  return state
}

async function lang(ext: string): Promise<Extension> {
  const description = LanguageDescription.matchFilename(languages, `x.${ext}`)
  if (!description) throw new Error(ext)
  return description.load()
}

describe('scopesAt', () => {
  let js: EditorState
  beforeAll(async () => {
    js = stateOf(
      [
        'class A {', // 1
        '  m() {', // 2
        '    if (x) {', // 3
        '      a()', // 4
        '    }', // 5
        '  }', // 6
        '}' // 7
      ],
      await lang('js')
    )
  })

  it('syntax tree blocks enclosing the line, from outside in', () => {
    expect(scopesAt(js, 4).map((s) => s.header)).toEqual([1, 2, 3])
    expect(scopesAt(js, 6).map((s) => s.header)).toEqual([1, 2])
    expect(scopesAt(js, 1)).toEqual([])
    expect(scopesAt(js, 99)).toEqual([])
  })

  it('feeds the pinned lines computation', () => {
    expect(stickyLines((line) => scopesAt(js, line), 3, 5)).toEqual([1, 2])
  })

  it('Markdown: the sections come from the service folds', async () => {
    const md = stateOf(['# One', '', '## Two', '', 'text', '', 'more'], await lang('md'))
    expect(scopesAt(md, 5).map((s) => s.header)).toEqual([1, 3])
  })
})
