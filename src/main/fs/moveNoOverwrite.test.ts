import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { lstat } from 'node:fs/promises'
import type * as FsPromises from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let linkError: NodeJS.ErrnoException | null = null
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>()
  return { ...actual, link: (a: string, b: string) => (linkError ? Promise.reject(linkError) : actual.link(a, b)) }
})

import { moveNoOverwrite } from './moveNoOverwrite'
import { makeRealTempDir } from '../testing/testEnv'

describe('moveNoOverwrite', () => {
  let dir: string
  beforeEach(() => {
    dir = makeRealTempDir('walph-move-')
  })
  afterEach(() => {
    linkError = null
    rmSync(dir, { recursive: true, force: true })
  })
  const fail = (code: string): NodeJS.ErrnoException => Object.assign(new Error(code), { code })

  it('falls back to rename when the volume does not hardlink (EISDIR on FAT32/exFAT, EPERM…)', async () => {
    for (const code of ['EISDIR', 'EPERM', 'ENOTSUP']) {
      linkError = fail(code)
      const from = join(dir, `a-${code}.txt`)
      const to = join(dir, `b-${code}.txt`)
      writeFileSync(from, 'x')
      await moveNoOverwrite(from, to, await lstat(from))
      expect(readFileSync(to, 'utf8')).toBe('x')
    }
  })

  it('in the fallback, an occupied destination stays protected', async () => {
    linkError = fail('EISDIR')
    writeFileSync(join(dir, 'a'), 'a')
    writeFileSync(join(dir, 'b'), 'b')
    await expect(moveNoOverwrite(join(dir, 'a'), join(dir, 'b'), await lstat(join(dir, 'a')))).rejects.toThrow(
      'Já existe: b'
    )
    expect(readFileSync(join(dir, 'b'), 'utf8')).toBe('b')
  })

  it('EEXIST from link propagates (occupied destination)', async () => {
    linkError = fail('EEXIST')
    writeFileSync(join(dir, 'a'), 'a')
    await expect(moveNoOverwrite(join(dir, 'a'), join(dir, 'b'), await lstat(join(dir, 'a')))).rejects.toMatchObject({
      code: 'EEXIST'
    })
  })
})
