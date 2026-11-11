import { describe, expect, it } from 'vitest'
import { normalizeLocations } from './locations'

const r = (l: number) => ({ start: { line: l, character: 0 }, end: { line: l, character: 3 } })

describe('normalizeLocations', () => {
  it('single Location and list', () => {
    expect(normalizeLocations({ uri: 'file:///a/b.ts', range: r(1) }, 'linux')).toEqual([
      { path: '/a/b.ts', range: r(1) }
    ])
    expect(
      normalizeLocations(
        [
          { uri: 'file:///a/b.ts', range: r(1) },
          { uri: 'file:///c.ts', range: r(2) }
        ],
        'linux'
      )
    ).toHaveLength(2)
  })

  it('LocationLink uses targetSelectionRange (falling back to targetRange)', () => {
    expect(
      normalizeLocations([{ targetUri: 'file:///a.ts', targetRange: r(1), targetSelectionRange: r(2) }], 'linux')
    ).toEqual([{ path: '/a.ts', range: r(2) }])
    expect(normalizeLocations([{ targetUri: 'file:///a.ts', targetRange: r(1) }], 'linux')).toEqual([
      { path: '/a.ts', range: r(1) }
    ])
  })

  it('drops non-file URIs, malformed ones and duplicates', () => {
    const list = [
      { uri: 'untitled:Untitled-1', range: r(0) },
      { uri: 'file:///a.ts', range: { start: { line: -1 } } },
      { uri: 'file:///a.ts', range: r(1) },
      { uri: 'file:///a.ts', range: r(1) },
      7
    ]
    expect(normalizeLocations(list, 'linux')).toEqual([{ path: '/a.ts', range: r(1) }])
  })

  it('applies the canonical spelling (Windows, lowercase drive)', () => {
    const canon = (p: string): string => p.replace(/^c:/, 'C:')
    expect(normalizeLocations({ uri: 'file:///c%3A/proj/a.ts', range: r(1) }, 'win32', canon)).toEqual([
      { path: 'C:\\proj\\a.ts', range: r(1) }
    ])
  })

  it('null and junk become an empty list', () => {
    expect(normalizeLocations(null)).toEqual([])
    expect(normalizeLocations('x')).toEqual([])
  })
})
