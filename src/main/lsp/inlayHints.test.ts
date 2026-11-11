import { describe, expect, it } from 'vitest'
import { normalizeInlayHints } from './inlayHints'

const p = (line: number, character: number) => ({ line, character })

describe('normalizeInlayHints', () => {
  it('a text label becomes one part; parts keep the order and the tooltip as plain text', () => {
    const hints = normalizeInlayHints([
      {
        position: p(2, 4),
        label: [{ value: 'a' }, { value: ': ', tooltip: { kind: 'markdown', value: '**x**' } }, { value: '' }, 3],
        kind: 2,
        paddingRight: true
      },
      { position: p(0, 1), label: ': number', kind: 1, tooltip: '  type  ' }
    ])
    expect(hints).toEqual([
      {
        position: p(0, 1),
        label: [{ value: ': number' }],
        kind: 'type',
        paddingLeft: false,
        paddingRight: false,
        tooltip: 'type'
      },
      {
        position: p(2, 4),
        label: [{ value: 'a' }, { value: ': ', tooltip: '**x**' }],
        kind: 'parameter',
        paddingLeft: false,
        paddingRight: true
      }
    ])
  })

  it('drops malformed ones and empty labels and caps the label size', () => {
    const hints = normalizeInlayHints([
      { position: p(-1, 0), label: 'x' },
      { position: p(0, 0), label: '' },
      { position: p(0, 0), label: [] },
      null,
      { position: p(1, 0), label: 'y'.repeat(500), kind: 9 }
    ])
    expect(hints).toHaveLength(1)
    expect(hints[0]?.label[0]?.value).toHaveLength(200)
    expect(hints[0]?.kind).toBeUndefined()
    expect(normalizeInlayHints(null)).toEqual([])
  })

  it('caps the number of hints', () => {
    const many = Array.from({ length: 2500 }, (_, i) => ({ position: p(i, 0), label: 'h' }))
    expect(normalizeInlayHints(many)).toHaveLength(2000)
  })
})
