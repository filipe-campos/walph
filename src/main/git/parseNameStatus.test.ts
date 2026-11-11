import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseNameStatus } from './parseNameStatus'

const root = join('/repo')

describe('parseNameStatus', () => {
  it('reads added, modified and removed', () => {
    const out = 'A\0new.ts\0M\0src/a.ts\0D\0old.ts\0'
    expect(parseNameStatus(out, root)).toEqual([
      { path: join(root, 'new.ts'), status: 'A' },
      { path: join(root, 'src/a.ts'), status: 'M' },
      { path: join(root, 'old.ts'), status: 'D' }
    ])
  })

  it('reads renames with source and destination (R100)', () => {
    const out = 'R100\0a.ts\0b.ts\0M\0c.ts\0'
    expect(parseNameStatus(out, root)).toEqual([
      { path: join(root, 'b.ts'), oldPath: join(root, 'a.ts'), status: 'R' },
      { path: join(root, 'c.ts'), status: 'M' }
    ])
  })

  it('accepts names with spaces and accents; empty output', () => {
    expect(parseNameStatus('A\0pasta/ação nova.txt\0', root)[0].path).toBe(join(root, 'pasta/ação nova.txt'))
    expect(parseNameStatus('', root)).toEqual([])
  })
})

describe('parseNameStatus: extra cases', () => {
  it('reads copies (C) with source and destination', () => {
    expect(parseNameStatus('C075\0a.ts\0b.ts\0', root)).toEqual([
      { path: join(root, 'b.ts'), oldPath: join(root, 'a.ts'), status: 'C' }
    ])
  })

  it('keeps the code of other statuses (T) and ignores empty tokens', () => {
    expect(parseNameStatus('T\0link\0\0', root)).toEqual([{ path: join(root, 'link'), status: 'T' }])
  })

  it('a truncated rename (without destination) is dropped without losing what came before', () => {
    expect(parseNameStatus('M\0ok.ts\0R100\0so-origem.ts', root)).toEqual([{ path: join(root, 'ok.ts'), status: 'M' }])
  })

  it('M without a path is dropped', () => {
    expect(parseNameStatus('M\0', root)).toEqual([])
  })

  it('paths with a trailing slash in repoRoot do not duplicate separators', () => {
    expect(parseNameStatus('M\0a.ts\0', root + '/')[0].path).toBe(join(root, 'a.ts'))
  })

  it('a name with a line break and quotes is not misread (-z)', () => {
    expect(parseNameStatus('A\0a\nb "c".txt\0', root)[0].path).toBe(join(root, 'a\nb "c".txt'))
  })
})
