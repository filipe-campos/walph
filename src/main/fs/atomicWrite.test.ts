// @vitest-environment node
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AlreadyExistsError } from './moveNoOverwrite'
import {
  createFileExclusive,
  isAtomicTempPath,
  writeFileAtomic,
  writeFileAtomicSync,
  writeJsonAtomicSync
} from './atomicWrite'

const posix = process.platform !== 'win32'
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'walph-atomic-'))
})
afterEach(() => {
  chmodSync(dir, 0o755)
  rmSync(dir, { recursive: true, force: true })
})

const leftovers = (d = dir) => readdirSync(d).filter((n) => n.endsWith('.tmp'))

type Write = (p: string, d: string | Uint8Array, o?: object) => Promise<void>

describe.each<[string, Write]>([
  ['async', async (p: string, d: string | Uint8Array, o?: object) => void (await writeFileAtomic(p, d, o))],
  ['sync', async (p: string, d: string | Uint8Array, o?: object) => writeFileAtomicSync(p, d, o)]
] as const)('writeFileAtomic (%s)', (_name, write) => {
  it('creates a new file with the content and no temp files', async () => {
    const file = join(dir, 'a.txt')
    await write(file, 'olá')
    expect(readFileSync(file, 'utf8')).toBe('olá')
    expect(leftovers()).toEqual([])
  })

  it('accepts bytes', async () => {
    const file = join(dir, 'b.bin')
    await write(file, new Uint8Array([0, 1, 255]))
    expect([...readFileSync(file)]).toEqual([0, 1, 255])
  })

  it('overwrites and keeps the mode of the existing file', async () => {
    const file = join(dir, 'run.sh')
    writeFileSync(file, 'old')
    chmodSync(file, 0o750)
    await write(file, 'new', { mode: 0o600 })
    expect(readFileSync(file, 'utf8')).toBe('new')
    if (posix) expect(statSync(file).mode & 0o777).toBe(0o750)
    expect(leftovers()).toEqual([])
  })

  it.runIf(posix)('a new file uses the requested mode despite the umask', async () => {
    const file = join(dir, 'walph')
    await write(file, '#!/bin/sh\n', { mode: 0o755 })
    expect(statSync(file).mode & 0o777).toBe(0o755)
  })

  it('creates the folders only with mkdirp', async () => {
    const file = join(dir, 'x', 'y', 'c.txt')
    await expect(Promise.resolve().then(() => write(file, 'a'))).rejects.toThrow()
    await write(file, 'a', { mkdirp: true })
    expect(readFileSync(file, 'utf8')).toBe('a')
  })

  it.runIf(posix)('writes to the symlink target and the link stays a link', async () => {
    const real = join(dir, 'real.txt')
    const link = join(dir, 'link.txt')
    writeFileSync(real, 'old')
    symlinkSync('real.txt', link)
    await write(link, 'new')
    expect(lstatSync(link).isSymbolicLink()).toBe(true)
    expect(readlinkSync(link)).toBe('real.txt')
    expect(readFileSync(real, 'utf8')).toBe('new')
    expect(leftovers()).toEqual([])
  })

  it.runIf(posix)('dangling link: refuses and does not create the target', async () => {
    const link = join(dir, 'link.txt')
    symlinkSync('target.txt', link)
    await expect(Promise.resolve().then(() => write(link, 'created'))).rejects.toThrow('link simbólico quebrado')
    expect(existsSync(join(dir, 'target.txt'))).toBe(false)
    expect(lstatSync(link).isSymbolicLink()).toBe(true)
    expect(leftovers()).toEqual([])
  })

  it.runIf(posix)('dangling link with followSymlinks: false replaces the link itself', async () => {
    const link = join(dir, 'link.txt')
    symlinkSync('target.txt', link)
    await write(link, 'created', { followSymlinks: false })
    expect(lstatSync(link).isSymbolicLink()).toBe(false)
    expect(existsSync(join(dir, 'target.txt'))).toBe(false)
  })

  it.runIf(posix)('forceMode imposes the mode on an existing file', async () => {
    const file = join(dir, 'walph')
    writeFileSync(file, 'old')
    chmodSync(file, 0o644)
    await write(file, 'new', { mode: 0o755, forceMode: true })
    expect(statSync(file).mode & 0o777).toBe(0o755)
  })

  it.runIf(posix)('followSymlinks: false uses the mode of the link, not of the target', async () => {
    const real = join(dir, 'real.txt')
    const link = join(dir, 'link.txt')
    writeFileSync(real, 'x')
    chmodSync(real, 0o600)
    symlinkSync('real.txt', link)
    await write(link, 'new', { followSymlinks: false, mode: 0o644, forceMode: true })
    expect(statSync(link).mode & 0o777).toBe(0o644)
    expect(statSync(real).mode & 0o777).toBe(0o600)
  })

  it.runIf(posix)('followSymlinks: false replaces the link itself', async () => {
    const real = join(dir, 'real.txt')
    const link = join(dir, 'link.txt')
    writeFileSync(real, 'intact')
    symlinkSync('real.txt', link)
    await write(link, 'new', { followSymlinks: false })
    expect(lstatSync(link).isSymbolicLink()).toBe(false)
    expect(readFileSync(link, 'utf8')).toBe('new')
    expect(readFileSync(real, 'utf8')).toBe('intact')
  })

  it.runIf(posix)('cleans up the temp file when the rename fails (destination is a folder)', async () => {
    const target = join(dir, 'folder')
    mkdirSync(target)
    await expect(Promise.resolve().then(() => write(target, 'x'))).rejects.toThrow()
    expect(leftovers()).toEqual([])
    expect(statSync(target).isDirectory()).toBe(true)
  })

  it.runIf(posix && process.getuid?.() !== 0)('read-only folder: fails without leaving a temp file', async () => {
    const file = join(dir, 'ro.txt')
    writeFileSync(file, 'intact')
    chmodSync(dir, 0o555)
    await expect(Promise.resolve().then(() => write(file, 'new'))).rejects.toThrow()
    chmodSync(dir, 0o755)
    expect(readFileSync(file, 'utf8')).toBe('intact')
    expect(leftovers()).toEqual([])
  })

  it('requires an absolute path', async () => {
    await expect(Promise.resolve().then(() => write('relative.txt', 'x'))).rejects.toThrow('Caminho inválido.')
  })
})

describe('writeFileAtomic', () => {
  it.runIf(posix && process.getuid?.() !== 0)(
    'fallbackInPlace: a writable file in a non-writable folder is written in place',
    async () => {
      const file = join(dir, 'ro.txt')
      writeFileSync(file, 'old')
      chmodSync(dir, 0o555)
      await expect(writeFileAtomic(file, 'without')).rejects.toThrow()
      expect(await writeFileAtomic(file, 'new', { fallbackInPlace: true })).toBe(true)
      chmodSync(dir, 0o755)
      expect(readFileSync(file, 'utf8')).toBe('new')
      expect(leftovers()).toEqual([])
    }
  )

  it.runIf(posix)('fallbackInPlace: a name too long for the temp file writes in place', async () => {
    const name = 'a'.repeat(250)
    const file = join(dir, name)
    try {
      writeFileSync(file, 'old')
    } catch {
      return // the file system does not accept 250 characters
    }
    await expect(writeFileAtomic(file, 'without')).rejects.toThrow()
    await writeFileAtomic(file, 'new', { fallbackInPlace: true })
    expect(readFileSync(file, 'utf8')).toBe('new')
    expect(leftovers()).toEqual([])
  })

  it.runIf(posix)('fallbackInPlace does not mask errors of another kind (destination is a folder)', async () => {
    const target = join(dir, 'folder')
    mkdirSync(target)
    await expect(writeFileAtomic(target, 'x', { fallbackInPlace: true })).rejects.toThrow()
    expect(leftovers()).toEqual([])
  })

  it('a vetoed beforeRename discards the temp file and does not write', async () => {
    const file = join(dir, 'v.txt')
    writeFileSync(file, 'current')
    expect(await writeFileAtomic(file, 'old', { beforeRename: () => false })).toBe(false)
    expect(readFileSync(file, 'utf8')).toBe('current')
    expect(leftovers()).toEqual([])
  })

  it('an allowed beforeRename writes', async () => {
    const file = join(dir, 'v.txt')
    expect(await writeFileAtomic(file, 'ok', { beforeRename: () => true })).toBe(true)
    expect(readFileSync(file, 'utf8')).toBe('ok')
  })

  it('the temp file is a hidden file in the same folder as the target', async () => {
    const file = join(dir, 'm.txt')
    const seen: string[] = []
    await writeFileAtomic(file, 'x', { beforeRename: () => (seen.push(...readdirSync(dir)), true) })
    expect(seen.some((n) => /^\.m\.txt\.walph-[0-9a-f]{12}\.tmp$/.test(n))).toBe(true)
  })
})

describe('writeJsonAtomicSync', () => {
  it('creates the folder and writes the JSON', () => {
    const file = join(dir, 'sub', 'state.json')
    writeJsonAtomicSync(file, { a: 1 })
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ a: 1 })
    expect(existsSync(file)).toBe(true)
    expect(leftovers(join(dir, 'sub'))).toEqual([])
  })
})

describe('isAtomicTempPath', () => {
  it('recognizes only the temp file generated by the helper', () => {
    expect(isAtomicTempPath('/r/src/.a.ts.walph-0123456789ab.tmp')).toBe(true)
    expect(isAtomicTempPath('C:\\r\\.a.ts.walph-0123456789ab.tmp')).toBe(true)
    expect(isAtomicTempPath('/r/a.ts')).toBe(false)
    expect(isAtomicTempPath('/r/a.walph-0123456789ab.tmp')).toBe(false)
    expect(isAtomicTempPath('/r/.walph-0123456789ab.tmp')).toBe(false)
  })
})

describe('writeFileAtomic with allowDangling (editor save)', () => {
  it.runIf(posix)('a dangling link creates the target and the link stays a link', async () => {
    const link = join(dir, 'link.txt')
    symlinkSync('target.txt', link)
    await writeFileAtomic(link, 'created', { allowDangling: true })
    expect(readFileSync(join(dir, 'target.txt'), 'utf8')).toBe('created')
    expect(lstatSync(link).isSymbolicLink()).toBe(true)
    expect(leftovers()).toEqual([])
  })
})

describe('createFileExclusive', () => {
  it('creates the file and the missing folders', async () => {
    const path = join(dir, 'a', 'b', 'new.txt')
    await createFileExclusive(path, 'hi')
    expect(readFileSync(path, 'utf8')).toBe('hi')
  })

  it('an occupied destination throws AlreadyExistsError and does not change the content', async () => {
    const path = join(dir, 'x.txt')
    writeFileSync(path, 'before')
    await expect(createFileExclusive(path, 'after')).rejects.toBeInstanceOf(AlreadyExistsError)
    expect(readFileSync(path, 'utf8')).toBe('before')
  })

  it.runIf(posix)('does not follow a link planted at the destination', async () => {
    const alvo = join(dir, 'target.txt')
    const link = join(dir, 'link.txt')
    symlinkSync(alvo, link)
    await expect(createFileExclusive(link, 'x')).rejects.toBeInstanceOf(AlreadyExistsError)
    expect(existsSync(alvo)).toBe(false)
  })

  it.runIf(posix)('applies the requested mode', async () => {
    const path = join(dir, 'm.txt')
    await createFileExclusive(path, '', { mode: 0o600 })
    expect(statSync(path).mode & 0o777).toBe(0o600)
  })

  it('refuses a relative path', async () => {
    await expect(createFileExclusive('rel.txt', '')).rejects.toThrow()
  })

  it('a write failure removes the file it just created', async () => {
    const path = join(dir, 'fail.txt')
    await expect(createFileExclusive(path, {} as never)).rejects.toThrow()
    expect(existsSync(path)).toBe(false)
  })
})
