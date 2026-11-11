import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ReplaceRequest, SearchMatch } from '@shared/types'
import { isInside } from '@shared/pathCompare'
import { replaceAll } from './replaceFiles'
import { makeRealTempDir } from '../testing/testEnv'

const posix = process.platform !== 'win32'
const options = { caseSensitive: true, regex: false, wholeWord: false }

let base: string
let root: string

beforeEach(() => {
  base = makeRealTempDir('walph-replace-')
  root = join(base, 'root')
  mkdirSync(root)
})
afterEach(() => rmSync(base, { recursive: true, force: true }))

const match = (line: number, column: number, text: string, length = 3): SearchMatch => ({ line, column, length, text })

function run(path: string, matches: SearchMatch[], replacement = 'bar') {
  const request: ReplaceRequest = { query: 'foo', replacement, options, files: [{ path, matches }] }
  return replaceAll(root, request).then((r) => r.files[0])
}

describe('isInside (strict, as replace uses it)', () => {
  const strict = { strict: true, caseSensitive: true } as const
  it('accepts names that start with ..', () => {
    expect(isInside(root, join(root, '..env.ts'), strict)).toBe(true)
    expect(isInside(root, join(root, '..', 'x'), strict)).toBe(false)
    expect(isInside(root, root, strict)).toBe(false)
  })
})

describe('replaceAll', () => {
  it('replaces and leaves no temp files', async () => {
    const file = join(root, 'a.txt')
    writeFileSync(file, 'foo x\n')
    const out = await run(file, [match(1, 0, 'foo x')])
    expect(out).toEqual({ path: file, replaced: 1, skipped: [] })
    expect(readFileSync(file, 'utf8')).toBe('bar x\n')
    expect(readdirSync(root)).toEqual(['a.txt'])
  })

  it('refuses a path outside the root and with ..', async () => {
    const outside = join(base, 'out.txt')
    writeFileSync(outside, 'foo\n')
    expect((await run(outside, [match(1, 0, 'foo')])).error).toMatch(/fora da pasta/)
    expect((await run(join(root, '..', 'out.txt'), [match(1, 0, 'foo')])).error).toMatch(/fora da pasta/)
    expect(readFileSync(outside, 'utf8')).toBe('foo\n')
  })

  it.skipIf(!posix)('refuses a symlink pointing outside', async () => {
    const outside = join(base, 'out.txt')
    writeFileSync(outside, 'foo\n')
    const link = join(root, 'link.txt')
    symlinkSync(outside, link)
    expect((await run(link, [match(1, 0, 'foo')])).error).toMatch(/fora da pasta/)
    expect(readFileSync(outside, 'utf8')).toBe('foo\n')
  })

  it.skipIf(!posix)('an internal symlink stays a link and the target is written', async () => {
    const target = join(root, 'real.txt')
    const link = join(root, 'link.txt')
    writeFileSync(target, 'foo\n')
    symlinkSync(target, link)
    const out = await run(link, [match(1, 0, 'foo')])
    expect(out.replaced).toBe(1)
    expect(lstatSync(link).isSymbolicLink()).toBe(true)
    expect(readFileSync(target, 'utf8')).toBe('bar\n')
  })

  it('a non-UTF-8 file stays intact byte for byte', async () => {
    const file = join(root, 'latin.txt')
    const bytes = Buffer.from([0x66, 0x6f, 0x6f, 0x20, 0xe9, 0x0a])
    writeFileSync(file, bytes)
    const out = await run(file, [match(1, 0, 'foo �')])
    expect(out.error).toMatch(/UTF-8/)
    expect(out.replaced).toBe(0)
    expect(readFileSync(file).equals(bytes)).toBe(true)
  })

  it('preserves BOM and CRLF byte for byte', async () => {
    const file = join(root, 'bom.txt')
    writeFileSync(file, Buffer.from('﻿foo a\r\nfoo b\r\n', 'utf8'))
    const out = await run(file, [match(1, 0, 'foo a'), match(2, 0, 'foo b')])
    expect(out.replaced).toBe(2)
    expect(readFileSync(file).equals(Buffer.from('﻿bar a\r\nbar b\r\n', 'utf8'))).toBe(true)
  })

  it('a file deleted after the search gives a pt-BR error', async () => {
    const file = join(root, 'gone.txt')
    writeFileSync(file, 'foo\n')
    unlinkSync(file)
    const out = await run(file, [match(1, 0, 'foo')])
    expect(out.error).toBe('O arquivo não existe mais; nada foi alterado.')
    expect(out.skipped).toEqual([0])
  })

  it('skips matches whose line changed', async () => {
    const file = join(root, 'a.txt')
    writeFileSync(file, 'foo changed\nfoo b\n')
    const out = await run(file, [match(1, 0, 'foo old'), match(2, 0, 'foo b')])
    expect(out).toEqual({ path: file, replaced: 1, skipped: [0] })
    expect(readFileSync(file, 'utf8')).toBe('foo changed\nbar b\n')
  })

  it('refuses a file larger than 2 MB', async () => {
    const file = join(root, 'big.txt')
    writeFileSync(file, 'foo\n' + 'x'.repeat(2 * 1024 * 1024))
    const out = await run(file, [match(1, 0, 'foo')])
    expect(out.error).toMatch(/2 MB/)
    expect(existsSync(file) && statSync(file).size).toBeGreaterThan(2 * 1024 * 1024)
  })

  it.skipIf(!posix)('preserves the file mode', async () => {
    const file = join(root, 'run.sh')
    writeFileSync(file, 'foo\n')
    chmodSync(file, 0o755)
    await run(file, [match(1, 0, 'foo')])
    expect(statSync(file).mode & 0o777).toBe(0o755)
    expect(readFileSync(file, 'utf8')).toBe('bar\n')
  })

  it('a regex JS does not support throws a pt-BR error', async () => {
    const request: ReplaceRequest = {
      query: '(?<x>a)(?<x>b)',
      replacement: 'z',
      options: { ...options, regex: true },
      files: []
    }
    await expect(replaceAll(root, request)).rejects.toThrow(/não é suportada na substituição/)
  })
})
