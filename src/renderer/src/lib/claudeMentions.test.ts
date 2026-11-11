import { describe, expect, it } from 'vitest'
import {
  activeMention,
  applyMention,
  deriveFolders,
  formatMention,
  mentionCandidates,
  parseMentions,
  resolveInside
} from './claudeMentions'

describe('formatMention', () => {
  it('formats file, line and range', () => {
    expect(formatMention('src/a.ts')).toBe('@src/a.ts')
    expect(formatMention('src/a.ts', { startLine: 4, endLine: 4 })).toBe('@src/a.ts#L4')
    expect(formatMention('src/a.ts', { startLine: 10, endLine: 20 })).toBe('@src/a.ts#L10-20')
  })
  it('uses quotes when there is a space', () => {
    expect(formatMention('my folder/a.ts')).toBe('@"my folder/a.ts"')
  })
})

describe('activeMention', () => {
  it('finds the mention under the cursor', () => {
    expect(activeMention('see @src/ap', 11)).toEqual({ start: 4, end: 11, query: 'src/ap' })
    expect(activeMention('@a', 2)).toEqual({ start: 0, end: 2, query: 'a' })
  })
  it('extends the end up to the next space', () => {
    expect(activeMention('see @abc def', 6)).toEqual({ start: 4, end: 8, query: 'a' })
  })
  it('ignores e-mail, space, # and quotes', () => {
    expect(activeMention('a@b.com', 7)).toBeNull()
    expect(activeMention('@a b', 4)).toBeNull()
    expect(activeMention('@a#L1', 5)).toBeNull()
    expect(activeMention('@"a b', 5)).toBeNull()
    expect(activeMention('no mention', 4)).toBeNull()
  })
})

describe('applyMention', () => {
  it('a file ends with a space', () => {
    const m = activeMention('ver @ap resto', 7)!
    expect(applyMention('ver @ap resto', m, 'src/app.ts', false)).toEqual({
      text: 'ver @src/app.ts  resto',
      caret: 16
    })
  })
  it('a folder keeps the cursor right after the slash', () => {
    const m = activeMention('@sr', 3)!
    expect(applyMention('@sr', m, 'src/', true)).toEqual({ text: '@src/', caret: 5 })
  })
})

describe('mentionCandidates', () => {
  const files = ['README.md', 'src/app.ts', 'src/lib/path.ts', 'src/lib/path.test.ts']
  const folders = deriveFolders(files)
  it('derives folders', () => {
    expect(folders).toEqual(['src/', 'src/lib/'])
  })
  it('an empty query lists the root', () => {
    expect(mentionCandidates(files, folders, '', 10).map((c) => c.path)).toEqual(['src/', 'README.md'])
  })
  it('searches files and folders', () => {
    const out = mentionCandidates(files, folders, 'lib', 10)
    expect(out[0]).toMatchObject({ path: 'src/lib/', isDir: true })
    const path = mentionCandidates(files, folders, 'path.ts', 10)
    expect(path[0]).toMatchObject({ path: 'src/lib/path.ts', isDir: false })
  })
})

describe('resolveInside', () => {
  it('resolves relative paths and rejects escaping', () => {
    expect(resolveInside('/w/p', 'src/a.ts')).toBe('/w/p/src/a.ts')
    expect(resolveInside('/w/p', './src/../a.ts')).toBe('/w/p/a.ts')
    expect(resolveInside('/w/p', '../x')).toBeNull()
    expect(resolveInside('/w/p', '/etc/passwd')).toBeNull()
    expect(resolveInside('/w/p', '/w/p/src')).toBe('/w/p/src')
    expect(resolveInside('/w/p', '/w/pp/x')).toBeNull()
  })
  it('works with Windows paths', () => {
    expect(resolveInside('C:\\w\\p', 'src/a.ts')).toBe('C:\\w\\p\\src\\a.ts')
    expect(resolveInside('C:\\w\\p', '..\\..\\x')).toBeNull()
    expect(resolveInside('C:\\w\\p', 'c:\\W\\P\\a')).toBe('c:\\W\\P\\a')
  })
})

describe('parseMentions', () => {
  const root = '/w/p'
  it('extracts files, lines and ranges', () => {
    expect(parseMentions('olhe @src/a.ts#L10-20 e @b.ts#L3 e @c.ts', root)).toEqual([
      { path: '/w/p/src/a.ts', startLine: 10, endLine: 20 },
      { path: '/w/p/b.ts', startLine: 3, endLine: 3 },
      { path: '/w/p/c.ts' }
    ])
  })
  it('accepts quotes, strips punctuation and repeats', () => {
    expect(parseMentions('see @"a b/c.ts" and @d.ts, @d.ts.', root)).toEqual([
      { path: '/w/p/a b/c.ts' },
      { path: '/w/p/d.ts' }
    ])
  })
  it('a folder loses the trailing slash', () => {
    expect(parseMentions('@src/', root)).toEqual([{ path: '/w/p/src' }])
  })
  it('ignores escaping the folder and e-mail, and an inverted range is normalized', () => {
    expect(parseMentions('@../x a@b.com @src/a.ts#L9-2', root)).toEqual([
      { path: '/w/p/src/a.ts', startLine: 2, endLine: 9 }
    ])
  })
  it('filters out what does not exist', () => {
    expect(parseMentions('@someone @a.ts', root, (p) => p === 'a.ts')).toEqual([{ path: '/w/p/a.ts' }])
  })
})

describe('parseMentions - gaps', () => {
  const root = '/w/p'
  it('range followed by punctuation and more than one mention on the same line', () => {
    expect(parseMentions('see @src/a.ts#L10-20, and @b.ts#L3.', root)).toEqual([
      { path: '/w/p/src/a.ts', startLine: 10, endLine: 20 },
      { path: '/w/p/b.ts', startLine: 3, endLine: 3 }
    ])
  })
  it('same file with different ranges makes distinct attachments; an identical repeat disappears', () => {
    expect(parseMentions('@a.ts#L1-2 @a.ts#L5 @a.ts#L1-2 @a.ts', root)).toEqual([
      { path: '/w/p/a.ts', startLine: 1, endLine: 2 },
      { path: '/w/p/a.ts', startLine: 5, endLine: 5 },
      { path: '/w/p/a.ts' }
    ])
  })
  it('a quoted path accepts a range; line 0 discards the mention', () => {
    expect(parseMentions('@"my folder/a.ts"#L2-4', root)).toEqual([
      { path: '/w/p/my folder/a.ts', startLine: 2, endLine: 4 }
    ])
    expect(parseMentions('@a.ts#L0', root)).toEqual([])
  })
  it('mention at the start of a line in multiline text', () => {
    expect(parseMentions('first\n@a.ts\n@b.ts#L2', root)).toHaveLength(2)
  })
  it('Windows root with backslashes', () => {
    expect(parseMentions('@src/a.ts#L2-3 @..\\x', 'C:\\w\\p')).toEqual([
      { path: 'C:\\w\\p\\src\\a.ts', startLine: 2, endLine: 3 }
    ])
  })
  it('an absolute path inside the folder counts; outside it is ignored', () => {
    expect(parseMentions('@/w/p/a.ts @/etc/passwd', root)).toEqual([{ path: '/w/p/a.ts' }])
  })
})
