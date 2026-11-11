import { describe, expect, it } from 'vitest'
import { markColumns, previewWindow, splitSpanLines } from './peekPreview'

describe('previewWindow', () => {
  it('cuts around the target and stays inside the file', () => {
    expect(previewWindow(1000, 500, 502, 10)).toEqual({ from: 490, to: 513 })
    expect(previewWindow(20, 2, 3, 10)).toEqual({ from: 0, to: 14 })
    expect(previewWindow(20, 18, 19, 10)).toEqual({ from: 8, to: 20 })
  })

  it('a target outside the file (the text changed) is clamped to the existing lines', () => {
    expect(previewWindow(5, 40, 41, 2)).toEqual({ from: 2, to: 5 })
    expect(previewWindow(0, 0, 0)).toEqual({ from: 0, to: 0 })
  })
})

describe('splitSpanLines', () => {
  it('splits at \\n keeping the class', () => {
    expect(
      splitSpanLines([
        { text: 'a\nb', cls: 'k' },
        { text: 'c', cls: null },
        { text: '\n', cls: null }
      ])
    ).toEqual([
      [{ text: 'a', cls: 'k' }],
      [
        { text: 'b', cls: 'k' },
        { text: 'c', cls: null }
      ],
      []
    ])
  })
})

describe('markColumns', () => {
  it('cuts the spans at the highlighted range', () => {
    const spans = [
      { text: 'const ', cls: 'kw' },
      { text: 'fooBar', cls: 'var' },
      { text: ' = 1', cls: null }
    ]
    expect(markColumns(spans, 8, 11)).toEqual([
      { text: 'const ', cls: 'kw', mark: false },
      { text: 'fo', cls: 'var', mark: false },
      { text: 'oBa', cls: 'var', mark: true },
      { text: 'r', cls: 'var', mark: false },
      { text: ' = 1', cls: null, mark: false }
    ])
  })

  it('a range up to the end of the line or empty', () => {
    expect(markColumns([{ text: 'ab', cls: null }], 1, Number.MAX_SAFE_INTEGER).map((s) => s.mark)).toEqual([
      false,
      true
    ])
    expect(markColumns([{ text: 'ab', cls: null }], 1, 1)).toEqual([
      { text: 'a', cls: null, mark: false },
      { text: 'b', cls: null, mark: false }
    ])
  })
})
