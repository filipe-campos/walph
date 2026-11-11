import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { classifyBatch, mergeRawEvent, relativeSlash, toRootSpelling, type EntryKind, type RawKind } from './eventBatch'

describe('mergeRawEvent', () => {
  it('create followed by update stays create', () => {
    const batch = new Map<string, RawKind>()
    mergeRawEvent(batch, 'create', '/p/a')
    mergeRawEvent(batch, 'update', '/p/a')
    expect(batch.get('/p/a')).toBe('create')
  })

  it('the last event wins and the order is that of the most recent occurrence', () => {
    const batch = new Map<string, RawKind>()
    mergeRawEvent(batch, 'update', '/p/a')
    mergeRawEvent(batch, 'update', '/p/b')
    mergeRawEvent(batch, 'delete', '/p/a')
    expect([...batch]).toEqual([
      ['/p/b', 'update'],
      ['/p/a', 'delete']
    ])
  })
})

describe('toRootSpelling', () => {
  // `toRootSpelling` uses the platform `sep`: the paths are built with `join` so they also hold on Windows.
  const realRoot = join(sep, 'private', 'tmp', 'r')
  const root = join(sep, 'tmp', 'r')

  it('replaces the real prefix with the window folder spelling', () => {
    expect(toRootSpelling(join(realRoot, 'a.ts'), realRoot, root)).toBe(join(root, 'a.ts'))
    expect(toRootSpelling(realRoot, realRoot, root)).toBe(root)
  })

  it('does not confuse sibling folders with the same prefix nor touch anything when they are equal', () => {
    const sibling = join(sep, 'private', 'tmp', 'r2', 'a')
    expect(toRootSpelling(sibling, realRoot, root)).toBe(sibling)
    expect(toRootSpelling(join(sep, 'a', 'b'), join(sep, 'a'), join(sep, 'a'))).toBe(join(sep, 'a', 'b'))
  })
})

describe('relativeSlash', () => {
  it('returns the relative path and null for the root or outside it', () => {
    expect(relativeSlash('/r', '/r/a/b.ts')).toBe('a/b.ts')
    expect(relativeSlash('/r', '/r')).toBeNull()
    expect(relativeSlash('/r', '/other/x')).toBeNull()
  })

  it('a name that only starts with ".." stays inside the root', () => {
    expect(relativeSlash('/r', '/r/..foo')).toBe('..foo')
    expect(relativeSlash('/r', '/r/..foo/x.ts')).toBe('..foo/x.ts')
    expect(relativeSlash('/r', '/r/../x')).toBeNull()
  })
})

describe('classifyBatch', () => {
  const kinds: Record<string, EntryKind> = { '/r/a.ts': 'file', '/r/src': 'dir', '/r/b.ts': 'file', '/r/gone': null }
  const stat = async (p: string): Promise<EntryKind> => kinds[p] ?? null

  it('file create becomes add; update becomes change; removal becomes unlink', async () => {
    const batch = new Map<string, RawKind>([
      ['/r/a.ts', 'create'],
      ['/r/b.ts', 'update'],
      ['/r/old.ts', 'delete']
    ])
    const { files, dirs } = await classifyBatch(batch, stat)
    expect(files).toEqual([
      { path: '/r/a.ts', type: 'add' },
      { path: '/r/b.ts', type: 'change' },
      { path: '/r/old.ts', type: 'unlink' }
    ])
    expect(dirs).toEqual(['/r'])
  })

  it('ignores the atomic save temporary (created and renamed within the batch)', async () => {
    const batch = new Map<string, RawKind>([
      ['/r/.a.ts.walph-0123456789ab.tmp', 'delete'],
      ['/r/a.ts', 'update']
    ])
    const { files, dirs } = await classifyBatch(batch, stat)
    expect(files).toEqual([{ path: '/r/a.ts', type: 'change' }])
    expect(dirs).toEqual(['/r'])
  })

  it('a new folder only marks the parent; what vanished before the stat is ignored', async () => {
    const batch = new Map<string, RawKind>([
      ['/r/src', 'create'],
      ['/r/gone', 'create']
    ])
    const { files, dirs } = await classifyBatch(batch, stat)
    expect(files).toEqual([])
    expect(dirs).toEqual(['/r'])
  })

  it('events inside .git produce neither dirs nor files', async () => {
    const batch = new Map<string, RawKind>([
      ['/r/.git/HEAD', 'update'],
      ['/r/.git/refs/heads/x', 'delete']
    ])
    expect(await classifyBatch(batch, stat)).toEqual({ dirs: [], files: [] })
  })

  it('keeps the batch order even with stats finishing out of order', async () => {
    const slow = async (p: string): Promise<EntryKind> => {
      await new Promise((r) => setTimeout(r, p.endsWith('1') ? 20 : 0))
      return 'file'
    }
    const batch = new Map<string, RawKind>([
      ['/r/f1', 'update'],
      ['/r/f2', 'update']
    ])
    const { files } = await classifyBatch(batch, slow)
    expect(files.map((f) => f.path)).toEqual(['/r/f1', '/r/f2'])
  })
})
