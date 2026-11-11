import { describe, expect, it } from 'vitest'
import { nextFileRevs } from './fileRevs'

const diff = (path: string, extra: object = {}) => ({ kind: 'diff' as const, path, ...extra })
const change = (path: string) => ({ path, type: 'change' as const })

describe('nextFileRevs', () => {
  it('without diff tabs and with an empty map changes nothing', () => {
    expect(nextFileRevs([{ kind: 'file' as const, path: '/a' }], {}, [change('/a')])).toBeNull()
  })

  it('adds 1 only to the diffs touched by the batch and starts the new ones at 0', () => {
    const tabs = [diff('/a'), diff('/b')]
    expect(nextFileRevs(tabs, { '/a': 2 }, [change('/a')])).toEqual({ '/a': 3, '/b': 0 })
  })

  it('a batch that touches no open diff changes nothing when the map is already complete', () => {
    expect(nextFileRevs([diff('/a')], { '/a': 1 }, [change('/x')])).toBeNull()
  })

  it('a new diff tab outside the map and a batch that does not touch it: nothing changes (it stays out until touched)', () => {
    expect(nextFileRevs([diff('/a'), diff('/novo')], { '/a': 1 }, [change('/x')])).toBeNull()
  })

  it('null files (re-evaluate all) adds to every diff', () => {
    expect(nextFileRevs([diff('/a'), diff('/b')], { '/a': 1, '/b': 4 }, null)).toEqual({ '/a': 2, '/b': 5 })
  })

  it('prunes paths of closed tabs (and signals the change even without a touch)', () => {
    expect(nextFileRevs([diff('/a')], { '/a': 1, '/gone': 7 }, [change('/x')])).toEqual({ '/a': 1 })
  })

  it('commit diffs and Claude proposal diffs do not go in', () => {
    const tabs = [diff('/c', { commit: 'abc' }), diff('/p', { proposal: {} }), diff('/w')]
    expect(nextFileRevs(tabs, {}, null)).toEqual({ '/w': 1 })
  })

  it('image and Markdown preview tabs go in; a text file and a directory do not', () => {
    const tabs = [
      { kind: 'image' as const, path: '/i.png' },
      { kind: 'markdownPreview' as const, path: '/r.md' },
      { kind: 'file' as const, path: '/f.ts' }
    ]
    expect(nextFileRevs(tabs, {}, [change('/i.png'), change('/r.md'), change('/f.ts')])).toEqual({
      '/i.png': 1,
      '/r.md': 1
    })
  })

  it('the same path in several tabs goes up only once per batch', () => {
    const tabs = [diff('/a'), { kind: 'markdownPreview' as const, path: '/a' }]
    expect(nextFileRevs(tabs, { '/a': 0 }, [change('/a')])).toEqual({ '/a': 1 })
  })

  it('does not change the received map', () => {
    const current = { '/a': 1 }
    nextFileRevs([diff('/a')], current, null)
    expect(current).toEqual({ '/a': 1 })
  })
})
