import { describe, expect, it } from 'vitest'
import { normalizeDocumentHighlights } from './documentHighlights'

const r = (line: number, a: number, b: number) => ({ start: { line, character: a }, end: { line, character: b } })

describe('normalizeDocumentHighlights', () => {
  it('maps the kinds (no kind = text) and sorts by start', () => {
    expect(
      normalizeDocumentHighlights([
        { range: r(3, 0, 3), kind: 3 },
        { range: r(1, 2, 5), kind: 2 },
        { range: r(0, 0, 3) }
      ])
    ).toEqual([
      { range: r(0, 0, 3), kind: 'text' },
      { range: r(1, 2, 5), kind: 'read' },
      { range: r(3, 0, 3), kind: 'write' }
    ])
  })

  it('drops inverted or malformed ranges', () => {
    expect(normalizeDocumentHighlights([{ range: r(0, 5, 2) }, { range: {} }, 'x', null])).toEqual([])
    expect(normalizeDocumentHighlights(null)).toEqual([])
  })
})
