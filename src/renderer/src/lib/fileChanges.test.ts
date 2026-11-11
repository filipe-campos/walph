import { describe, expect, it } from 'vitest'
import { lastChangeFor } from './fileChanges'

describe('lastChangeFor', () => {
  it('ignores events of other files', () => {
    expect(lastChangeFor('/p/a.ts', [{ path: '/p/b.ts', type: 'change' }])).toBeNull()
  })
  it('uses the last event of the file itself', () => {
    expect(
      lastChangeFor('/p/a.ts', [
        { path: '/p/a.ts', type: 'unlink' },
        { path: '/p/a.ts', type: 'add' }
      ])
    ).toBe('add')
    expect(
      lastChangeFor('/p/a.ts', [
        { path: '/p/a.ts', type: 'change' },
        { path: '/p/a.ts', type: 'unlink' }
      ])
    ).toBe('unlink')
  })
  it('unlink of a folder hits the files inside it', () => {
    expect(lastChangeFor('/p/src/a.ts', [{ path: '/p/src', type: 'unlink' }])).toBe('unlink')
    expect(lastChangeFor('/p/srcx/a.ts', [{ path: '/p/src', type: 'unlink' }])).toBeNull()
  })
  it('add/change of a folder does not affect files inside it', () => {
    expect(lastChangeFor('/p/src/a.ts', [{ path: '/p/src', type: 'add' }])).toBeNull()
  })
})
