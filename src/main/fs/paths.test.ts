import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeRealTempDir } from '../testing/testEnv'
import { canonicalPath, resolveInsideRoot } from './paths'

let base: string
let root: string
let outside: string
beforeEach(() => {
  base = makeRealTempDir('walph-paths-')
  root = join(base, 'ws')
  outside = join(base, 'outside')
  mkdirSync(root)
  mkdirSync(outside)
})
afterEach(() => rmSync(base, { recursive: true, force: true }))

describe('canonicalPath', () => {
  it('a file that does not exist: real ancestor plus the rest', async () => {
    expect(await canonicalPath(join(root, 'a', 'b.txt'))).toBe(join(root, 'a', 'b.txt'))
  })

  it.skipIf(process.platform === 'win32')('follows a folder symlink and a dangling symlink to the target', async () => {
    symlinkSync(outside, join(root, 'dir'), 'junction')
    symlinkSync(join(outside, 'target.txt'), join(root, 'dangling.txt'))
    expect(await canonicalPath(join(root, 'dir', 'x.txt'))).toBe(join(outside, 'x.txt'))
    expect(await canonicalPath(join(root, 'dangling.txt'))).toBe(join(outside, 'target.txt'))
  })

  it.skipIf(process.platform === 'win32')(
    'relative target of a dangling link starts from the real folder of the link',
    async () => {
      const deep = join(outside, 'deep', 'dir')
      mkdirSync(deep, { recursive: true })
      mkdirSync(join(root, 'sub0'))
      symlinkSync(deep, join(root, 'sub'), 'junction')
      symlinkSync('../x', join(root, 'sub', 'link'))
      expect(await canonicalPath(join(root, 'sub', 'link'))).toBe(join(outside, 'deep', 'x'))
      await expect(resolveInsideRoot(root, join(root, 'sub', 'link'))).rejects.toThrow(/fora da pasta aberta/)
    }
  )

  it.skipIf(process.platform === 'win32')('a symlink cycle does not hang', async () => {
    symlinkSync(join(root, 'b'), join(root, 'a'))
    symlinkSync(join(root, 'a'), join(root, 'b'))
    await expect(canonicalPath(join(root, 'a'))).resolves.toBe(join(root, 'a'))
  })
})

describe('resolveInsideRoot', () => {
  it.skipIf(process.platform === 'win32')('a dangling symlink pointing outside does not count as inside', async () => {
    symlinkSync(join(outside, 'target.txt'), join(root, 'dangling.txt'))
    await expect(resolveInsideRoot(root, join(root, 'dangling.txt'))).rejects.toThrow(/fora da pasta aberta/)
  })

  it.skipIf(process.platform === 'win32')('a dangling symlink pointing inside counts', async () => {
    symlinkSync(join(root, 'target.txt'), join(root, 'dangling.txt'))
    await expect(resolveInsideRoot(root, join(root, 'dangling.txt'))).resolves.toBe(join(root, 'dangling.txt'))
  })

  it('a new file inside the folder counts', async () => {
    writeFileSync(join(root, 'a.txt'), '')
    await expect(resolveInsideRoot(root, join(root, 'new', 'b.txt'))).resolves.toBe(join(root, 'new', 'b.txt'))
  })
})
