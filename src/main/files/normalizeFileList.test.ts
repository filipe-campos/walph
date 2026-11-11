import { describe, expect, it } from 'vitest'
import { drainRgPaths, normalizeRgPath, shouldInvalidateFileList } from './normalizeFileList'

describe('normalizeRgPath', () => {
  it('removes the ./ prefix', () => {
    expect(normalizeRgPath('./a/b.ts')).toBe('a/b.ts')
  })
  it('converts Windows separators and removes .\\', () => {
    expect(normalizeRgPath('.\\a\\b.ts', true)).toBe('a/b.ts')
    expect(normalizeRgPath('src\\main\\index.ts', true)).toBe('src/main/index.ts')
  })

  it('keeps \\ on POSIX, where it is a valid name character', () => {
    expect(normalizeRgPath('./a\\b.txt')).toBe('a\\b.txt')
  })
  it('keeps paths without a prefix', () => {
    expect(normalizeRgPath('a/b.ts')).toBe('a/b.ts')
  })
  it('preserves spaces and unicode', () => {
    expect(normalizeRgPath('./my folder/ação ü.txt')).toBe('my folder/ação ü.txt')
  })
  it('does not remove the dots of hidden files', () => {
    expect(normalizeRgPath('./.env.example')).toBe('.env.example')
  })
})

describe('drainRgPaths', () => {
  it('splits paths by NUL and returns an empty rest', () => {
    expect(drainRgPaths('', './a\0./b\0')).toEqual({ paths: ['a', 'b'], rest: '' })
  })
  it('keeps the trailing partial path as the rest', () => {
    expect(drainRgPaths('', './a\0./b/par')).toEqual({ paths: ['a'], rest: './b/par' })
  })
  it('joins a path split across chunks', () => {
    const first = drainRgPaths('', './src/ma')
    expect(first).toEqual({ paths: [], rest: './src/ma' })
    expect(drainRgPaths(first.rest, 'in/index.ts\0./x')).toEqual({ paths: ['src/main/index.ts'], rest: './x' })
  })
  it('handles the NUL at the start of the next chunk', () => {
    const first = drainRgPaths('', './a')
    expect(drainRgPaths(first.rest, '\0./b\0')).toEqual({ paths: ['a', 'b'], rest: '' })
  })
  it('ignores an empty chunk and empty entries', () => {
    expect(drainRgPaths('', '')).toEqual({ paths: [], rest: '' })
    expect(drainRgPaths('./p', '')).toEqual({ paths: [], rest: './p' })
    expect(drainRgPaths('', '\0\0./a\0')).toEqual({ paths: ['a'], rest: '' })
  })
  it('accepts names with a line break', () => {
    expect(drainRgPaths('', './a\nb.txt\0')).toEqual({ paths: ['a\nb.txt'], rest: '' })
  })
  it('does not duplicate paths when processing byte by byte', () => {
    const all: string[] = []
    let rest = ''
    for (const ch of './one\0./two ü\0./three') {
      const r = drainRgPaths(rest, ch)
      all.push(...r.paths)
      rest = r.rest
    }
    expect(all).toEqual(['one', 'two ü'])
    expect(rest).toBe('./three')
  })
})

describe('shouldInvalidateFileList', () => {
  it.each(['add', 'unlink', 'addDir', 'unlinkDir'])('invalidates on %s', (event) => {
    expect(shouldInvalidateFileList(event, '/r/src/new.ts')).toBe(true)
  })
  it('does not invalidate on change of a regular file', () => {
    expect(shouldInvalidateFileList('change', '/r/src/a.ts')).toBe(false)
  })
  it.each(['.gitignore', '.ignore', '.rgignore'])('invalidates on change of %s', (name) => {
    expect(shouldInvalidateFileList('change', `/r/${name}`)).toBe(true)
    expect(shouldInvalidateFileList('change', `C:\\r\\sub\\${name}`)).toBe(true)
  })
  it('does not invalidate on change of a file that looks like an ignore file', () => {
    expect(shouldInvalidateFileList('change', '/r/x.gitignore')).toBe(false)
  })
  it('does not invalidate for events inside .git', () => {
    expect(shouldInvalidateFileList('change', '/r/.git/index')).toBe(false)
    expect(shouldInvalidateFileList('change', 'C:\\r\\.git\\HEAD')).toBe(false)
  })
})
