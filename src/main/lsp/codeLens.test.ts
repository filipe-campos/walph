import { describe, expect, it } from 'vitest'
import { CodeLensCache, normalizeCodeLens, normalizeCodeLenses, normalizeLensCommand } from './codeLens'

const range = { start: { line: 3, character: 2 }, end: { line: 3, character: 8 } }
const uri = 'file:///p/a.ts'

describe('normalizeLensCommand', () => {
  it('showReferences and the like become ready locations (without going to the server)', () => {
    for (const command of [
      'editor.action.showReferences',
      'editor.action.peekLocations',
      'rust-analyzer.showReferences'
    ]) {
      expect(
        normalizeLensCommand(
          {
            title: '2 references',
            command,
            arguments: [
              uri,
              range.start,
              [
                { uri, range },
                { uri: 'x:y', range }
              ]
            ]
          },
          'linux'
        )
      ).toEqual({ title: '2 references', locations: [{ path: '/p/a.ts', range }] })
    }
  })

  it('malformed locations become an empty list; the path goes through canon', () => {
    expect(normalizeLensCommand({ title: '0', command: 'editor.action.showReferences' }, 'linux')).toEqual({
      title: '0',
      locations: []
    })
    const canon = (p: string) => p.toUpperCase()
    expect(
      normalizeLensCommand(
        { title: 'r', command: 'editor.action.showReferences', arguments: [uri, {}, [{ uri, range }]] },
        'linux',
        canon
      )?.locations?.[0]?.path
    ).toBe('/P/A.TS')
  })

  it('other commands go to the server; an empty command is only text', () => {
    expect(normalizeLensCommand({ title: 'Run', command: 'x.run', arguments: [1] })).toEqual({
      title: 'Run',
      command: { title: 'Run', command: 'x.run', arguments: [1] }
    })
    expect(normalizeLensCommand({ title: 'Could not determine references', command: '' })).toEqual({
      title: 'Could not determine references'
    })
  })

  it('empty (cancelled), control-laden or malformed title', () => {
    expect(normalizeLensCommand({ title: '', command: '' })).toBeNull()
    expect(normalizeLensCommand({ title: '  ', command: 'x' })).toBeNull()
    expect(normalizeLensCommand({ title: 'a\u001b[31mb', command: '' })).toEqual({ title: 'a [31mb' })
    expect(normalizeLensCommand({ title: 3 })).toBeNull()
    expect(normalizeLensCommand('x')).toBeNull()
    expect(normalizeLensCommand({ title: 'x'.repeat(300) })?.title).toHaveLength(200)
  })

  it('arguments invalid for the server leave the lens as text only', () => {
    expect(normalizeLensCommand({ title: 'x', command: 'x.run', arguments: 'not a list' })).toEqual({ title: 'x' })
  })
})

describe('normalizeCodeLens(es)', () => {
  it('a lens without a command stays unresolved; without a range it is dropped', () => {
    expect(normalizeCodeLens({ range, data: 1 })).toEqual({ range })
    expect(normalizeCodeLens({ range, command: { title: '' } })).toEqual({ range })
    expect(normalizeCodeLens({ data: 1 })).toBeNull()
    expect(normalizeCodeLens(null)).toBeNull()
  })

  it('the list keeps the raw items aligned with the valid lenses', () => {
    const a = { range, data: 'a' }
    const b = { range, command: { title: 'B', command: 'b' } }
    const { lenses, raws } = normalizeCodeLenses([a, { range: 1 }, 'x', b])
    expect(lenses).toHaveLength(2)
    expect(raws).toEqual([a, b])
    expect(normalizeCodeLenses(null)).toEqual({ lenses: [], raws: [] })
  })
})

describe('CodeLensCache', () => {
  it('keeps only the last list of each document and forgets by owner', () => {
    const cache = new CodeLensCache<string>()
    const first = cache.store('/p/a.ts', 'ts', [{}])
    const second = cache.store('/p/a.ts', 'ts', [{}, {}])
    const other = cache.store('/p/b.ts', 'py', [])
    expect(cache.get('/p/a.ts', first)).toBeNull()
    expect(cache.get('/p/a.ts', second)?.raws).toHaveLength(2)
    cache.dropOwner((o) => o === 'ts')
    expect(cache.get('/p/a.ts', second)).toBeNull()
    expect(cache.get('/p/b.ts', other)).not.toBeNull()
    cache.delete('/p/b.ts')
    expect(cache.get('/p/b.ts', other)).toBeNull()
  })
})
