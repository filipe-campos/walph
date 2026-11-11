import { ensureSyntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { highlightTree, tagHighlighter, tags } from '@lezer/highlight'
import { describe, expect, it } from 'vitest'
import { loadLanguage } from './language'
import { scalarKind } from './yamlScalars'

describe('YAML', () => {
  it('key and value get different tags', async () => {
    const support = await loadLanguage('/a/c.yml')
    const doc = 'name: text\nport: 80\n'
    const state = EditorState.create({ doc, extensions: support ? [support] : [] })
    const tree = ensureSyntaxTree(state, state.doc.length, 5000)!
    const hl = tagHighlighter([
      { tag: tags.propertyName, class: 'key' },
      { tag: tags.string, class: 'str' }
    ])
    const out: Record<string, string> = {}
    highlightTree(tree, hl, (from, to, cls) => void (out[doc.slice(from, to)] = cls))
    expect(out.name).toContain('key')
    expect(out.text).toContain('str')
  })

  it('separates number from boolean and from text', () => {
    expect(scalarKind('42')).toBe('number')
    expect(scalarKind('-1.5e3')).toBe('number')
    expect(scalarKind('true')).toBe('atom')
    expect(scalarKind('null')).toBe('atom')
    expect(scalarKind('v1.2')).toBeNull()
    expect(scalarKind('text')).toBeNull()
  })
})
