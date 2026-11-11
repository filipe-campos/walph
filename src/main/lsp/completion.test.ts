import { describe, expect, it } from 'vitest'
import { COMPLETION_LIMIT, normalizeCompletion, normalizeCompletionItem } from './completion'

const range = (l: number, a: number, b: number) => ({
  start: { line: l, character: a },
  end: { line: l, character: b }
})

describe('normalizeCompletionItem', () => {
  it('insertText falls back to the label and the default format is plain text', () => {
    expect(normalizeCompletionItem({ label: 'foo' }, false)).toEqual({
      label: 'foo',
      insertText: 'foo',
      insertTextFormat: 'plain',
      resolvable: false
    })
  })

  it('snippet and insertText', () => {
    const item = normalizeCompletionItem({ label: 'log', insertText: 'log(${1:x})', insertTextFormat: 2 }, true)!
    expect(item).toMatchObject({ insertText: 'log(${1:x})', insertTextFormat: 'snippet', resolvable: true })
  })

  it('plain textEdit and InsertReplaceEdit (uses insert)', () => {
    expect(
      normalizeCompletionItem({ label: 'a', textEdit: { range: range(0, 1, 2), newText: 'ab' } }, false)
    ).toMatchObject({ textEdit: { range: range(0, 1, 2), newText: 'ab' }, insertText: 'ab' })
    const item = normalizeCompletionItem(
      { label: 'a', textEdit: { newText: 'ab', insert: range(0, 1, 2), replace: range(0, 1, 5) } },
      false
    )!
    expect(item.textEdit).toEqual({ range: range(0, 1, 2), newText: 'ab' })
  })

  it('an invalid textEdit is ignored', () => {
    const item = normalizeCompletionItem({ label: 'a', insertText: 'z', textEdit: { newText: 'x', range: 3 } }, false)!
    expect(item.textEdit).toBeUndefined()
    expect(item.insertText).toBe('z')
  })

  it('string documentation is plain text, MarkupContent keeps its kind', () => {
    expect(normalizeCompletionItem({ label: 'a', documentation: 'doc' }, false)!.documentation).toEqual({
      kind: 'plaintext',
      value: 'doc'
    })
    expect(
      normalizeCompletionItem({ label: 'a', documentation: { kind: 'markdown', value: '**d**' } }, false)!.documentation
    ).toEqual({ kind: 'markdown', value: '**d**' })
  })

  it('additionalTextEdits drops malformed ones; a kind outside 1..25 disappears', () => {
    const item = normalizeCompletionItem(
      {
        label: 'a',
        kind: 99,
        additionalTextEdits: [{ range: range(0, 0, 0), newText: 'import x\n' }, { newText: 1 }],
        commitCharacters: ['.', 3, '']
      },
      false
    )!
    expect(item.kind).toBeUndefined()
    expect(item.additionalTextEdits).toEqual([{ range: range(0, 0, 0), newText: 'import x\n' }])
    expect(item.commitCharacters).toEqual(['.'])
  })

  it('without a valid label it is not an item', () => {
    expect(normalizeCompletionItem({ label: '' }, false)).toBeNull()
    expect(normalizeCompletionItem({ label: 3 }, false)).toBeNull()
    expect(normalizeCompletionItem(null, false)).toBeNull()
  })
})

describe('normalizeCompletion', () => {
  it('CompletionList with isIncomplete', () => {
    const r = normalizeCompletion({ isIncomplete: true, items: [{ label: 'a' }, { label: 7 }, { label: 'b' }] }, true)
    expect(r.isIncomplete).toBe(true)
    expect(r.items.map((i) => i.label)).toEqual(['a', 'b'])
    // the raw items follow the valid items, at the same index
    expect(r.raws.map((i) => i.label)).toEqual(['a', 'b'])
  })

  it('plain array, null and junk', () => {
    expect(normalizeCompletion([{ label: 'a' }], false).items).toHaveLength(1)
    expect(normalizeCompletion(null, false)).toEqual({ isIncomplete: false, items: [], raws: [] })
    expect(normalizeCompletion('x', false).items).toEqual([])
  })

  it('caps the size and marks it as incomplete', () => {
    const items = Array.from({ length: COMPLETION_LIMIT + 5 }, (_, i) => ({ label: `i${i}` }))
    const r = normalizeCompletion(items, false)
    expect(r.items).toHaveLength(COMPLETION_LIMIT)
    expect(r.isIncomplete).toBe(true)
  })
})
