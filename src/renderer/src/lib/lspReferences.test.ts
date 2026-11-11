import { describe, expect, it } from 'vitest'
import type { LspLocation } from '@shared/types'
import { buildReferenceGroups, locationToItem, makePreview } from './lspReferences'

const loc = (path: string, line: number, sc: number, ec: number): LspLocation => ({
  path,
  range: { start: { line, character: sc }, end: { line, character: ec } }
})

describe('makePreview', () => {
  it('strips the indentation and adjusts the highlighted span', () => {
    expect(makePreview('    foo(bar)  ', 4, 3)).toEqual({ preview: 'foo(bar)', matchFrom: 0, matchTo: 3 })
    expect(makePreview('\tconst x = foo', 11, 3)).toEqual({ preview: 'const x = foo', matchFrom: 10, matchTo: 13 })
  })

  it('keeps the span visible on long lines', () => {
    const line = 'a'.repeat(500) + 'ALVO' + 'b'.repeat(500)
    const p = makePreview(line, 500, 4)
    expect(p.preview.length).toBe(200)
    expect(p.preview.slice(p.matchFrom, p.matchTo)).toBe('ALVO')
  })

  it('does not overflow with columns outside the line', () => {
    expect(makePreview('abc', 10, 5)).toEqual({ preview: 'abc', matchFrom: 3, matchTo: 3 })
  })
})

describe('locationToItem', () => {
  it('converts the LSP position (0-based) to a 1-based line', () => {
    const item = locationToItem(loc('/r/a.ts', 4, 2, 5), '  foo')
    expect(item).toMatchObject({ path: '/r/a.ts', line: 5, column: 2, length: 3, preview: 'foo' })
  })

  it('without the line text the preview is empty', () => {
    expect(locationToItem(loc('/r/a.ts', 0, 0, 1), undefined).preview).toBe('')
  })
})

describe('buildReferenceGroups', () => {
  it('groups by file, sorts by path and by position', () => {
    const items = [
      locationToItem(loc('/r/src/b.ts', 3, 0, 1), 'x'),
      locationToItem(loc('/r/a.ts', 9, 0, 1), 'x'),
      locationToItem(loc('/r/src/b.ts', 1, 4, 5), 'x'),
      locationToItem(loc('/r/src/b.ts', 1, 0, 1), 'x')
    ]
    const groups = buildReferenceGroups(items, '/r')
    expect(groups.map((g) => g.path)).toEqual(['/r/a.ts', '/r/src/b.ts'])
    expect(groups[0]).toMatchObject({ name: 'a.ts', dir: '' })
    expect(groups[1].dir).toBe('src')
    expect(groups[1].items.map((i) => [i.line, i.column])).toEqual([
      [2, 0],
      [2, 4],
      [4, 0]
    ])
  })
})
