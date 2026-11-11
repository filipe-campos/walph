import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveInsideRoot } from '../fs/paths'
import { readTextOrNull, writeTextAtomic } from './safePath'

let base: string
let root: string
let outsideDir: string

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'walph-safe-')))
  root = join(base, 'root')
  outsideDir = join(base, 'outside')
  await mkdir(root)
  await mkdir(outsideDir)
})
afterEach(() => rm(base, { recursive: true, force: true }))

describe('resolveInsideRoot', () => {
  it('accepts absolute and relative inside the folder, even nonexistent', async () => {
    expect(await resolveInsideRoot(root, join(root, 'a.ts'))).toBe(join(root, 'a.ts'))
    expect(await resolveInsideRoot(root, 'sub/new.ts')).toBe(join(root, 'sub', 'new.ts'))
  })
  it('refuses outside the folder, .. and garbage', async () => {
    await expect(resolveInsideRoot(root, join(outsideDir, 'x'))).rejects.toThrow('fora da pasta')
    await expect(resolveInsideRoot(root, '../outside/x')).rejects.toThrow('fora da pasta')
    await expect(resolveInsideRoot(root, '')).rejects.toThrow('inválido')
    await expect(resolveInsideRoot(root, 'a\0b')).rejects.toThrow('inválido')
  })
  // symlink requires developer/admin mode on Windows
  it.skipIf(process.platform === 'win32')(
    'folder behind a symlink: accepts the real spelling and returns the window one',
    async () => {
      const link = join(base, 'link-root')
      await symlink(root, link)
      await writeFile(join(root, 'u.ts'), 'x')
      expect(await resolveInsideRoot(link, join(root, 'u.ts'))).toBe(join(link, 'u.ts'))
      expect(await resolveInsideRoot(link, join(root, 'new', 'a.ts'))).toBe(join(link, 'new', 'a.ts'))
      await expect(resolveInsideRoot(link, join(outsideDir, 'x'))).rejects.toThrow('fora da pasta')
    }
  )
  it.skipIf(process.platform !== 'darwin')(
    'macOS: a real spelling in another Unicode form comes back in the window spelling, without changing the file',
    async () => {
      const real = join(base, 'ae\u0301e\u0301')
      await mkdir(real)
      const link = join(base, 'link-accent')
      await symlink(real, link)
      const nfc = join(base, 'a\u00e9\u00e9', 'xyz.txt')
      expect(await resolveInsideRoot(link, nfc)).toBe(join(link, 'xyz.txt'))
    }
  )
  it.skipIf(process.platform === 'win32')('refuses a symlink that escapes the folder', async () => {
    await symlink(outsideDir, join(root, 'link'))
    await expect(resolveInsideRoot(root, join(root, 'link', 'x.ts'))).rejects.toThrow('fora da pasta')
  })
})

describe('writeTextAtomic', () => {
  it('creates folders, writes and leaves no temp file', async () => {
    await writeTextAtomic(root, join(root, 'a', 'b.ts'), 'olá')
    expect(await readFile(join(root, 'a', 'b.ts'), 'utf8')).toBe('olá')
    expect((await readdir(join(root, 'a'))).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })
  it('refuses to write outside', async () => {
    await expect(writeTextAtomic(root, join(outsideDir, 'x.ts'), 'x')).rejects.toThrow('fora da pasta')
    expect(await readdir(outsideDir)).toEqual([])
  })
})

describe('readTextOrNull', () => {
  it('null if missing; reads text; refuses binary, folder and large', async () => {
    expect(await readTextOrNull(join(root, 'missing'), 100)).toBeNull()
    await writeFile(join(root, 't.txt'), 'abc')
    expect(await readTextOrNull(join(root, 't.txt'), 100)).toBe('abc')
    await writeFile(join(root, 'b.bin'), Buffer.from([1, 0, 2]))
    await expect(readTextOrNull(join(root, 'b.bin'), 100)).rejects.toThrow('binário')
    await expect(readTextOrNull(root, 100)).rejects.toThrow('não é um arquivo')
    await expect(readTextOrNull(join(root, 't.txt'), 2)).rejects.toThrow('grande')
  })
})

describe.skipIf(process.platform === 'win32')('writeTextAtomic with symbolic links', () => {
  it('a dangling link outside the folder: refuses and creates nothing outside', async () => {
    const victim = join(outsideDir, 'authorized_keys')
    await symlink(victim, join(root, 'notes.md'))
    await expect(writeTextAtomic(root, 'notes.md', 'pwn')).rejects.toThrow()
    expect(await readdir(outsideDir)).toEqual([])
  })

  it('a dangling link inside the folder is also refused (nothing is created)', async () => {
    await symlink(join(root, 'target.md'), join(root, 'notes.md'))
    await expect(writeTextAtomic(root, 'notes.md', 'x')).rejects.toThrow()
    expect(await readdir(root)).toEqual(['notes.md'])
  })

  it('an existing link whose target is outside the folder is refused and the target stays intact', async () => {
    const victim = join(outsideDir, 'real.txt')
    await writeFile(victim, 'intact')
    await symlink(victim, join(root, 'l.txt'))
    await expect(writeTextAtomic(root, 'l.txt', 'pwn')).rejects.toThrow('fora da pasta')
    expect(await readFile(victim, 'utf8')).toBe('intact')
  })

  it('an existing link inside the folder writes to the target', async () => {
    await writeFile(join(root, 'real.txt'), 'old')
    await symlink(join(root, 'real.txt'), join(root, 'l.txt'))
    await writeTextAtomic(root, 'l.txt', 'new')
    expect(await readFile(join(root, 'real.txt'), 'utf8')).toBe('new')
  })
})
