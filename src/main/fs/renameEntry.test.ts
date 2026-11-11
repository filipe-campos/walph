import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as MoveModule from './moveNoOverwrite'
import { isCaseOnlyRename, renameEntry } from './renameEntry'
import { makeRealTempDir } from '../testing/testEnv'

// Simulates the race: the destination appears after the check (the destination `lstat` still sees it as free).
let hideFromLstat: string | null = null
vi.mock('./moveNoOverwrite', async (importOriginal) => {
  const actual = await importOriginal<typeof MoveModule>()
  return {
    ...actual,
    lstatOrNull: (path: string) => (path === hideFromLstat ? Promise.resolve(null) : actual.lstatOrNull(path))
  }
})

describe('isCaseOnlyRename', () => {
  const same = { dev: 1, ino: 7 }
  it('is a case rename when the path differs only in case and the inode is the same (macOS/Windows)', () => {
    expect(isCaseOnlyRename('/p/a.txt', '/p/A.txt', same, same, 'darwin')).toBe(true)
    expect(isCaseOnlyRename('C:\\p\\a.txt', 'C:\\p\\A.txt', same, same, 'win32')).toBe(true)
  })
  it('is not when the inode differs (case-sensitive volume) or on Linux', () => {
    expect(isCaseOnlyRename('/p/a.txt', '/p/A.txt', same, { dev: 1, ino: 8 }, 'darwin')).toBe(false)
    expect(isCaseOnlyRename('/p/a.txt', '/p/A.txt', same, same, 'linux')).toBe(false)
  })
  it('does not treat another name with the same inode (hardlink) as case', () => {
    expect(isCaseOnlyRename('/p/a.txt', '/p/b.txt', same, same, 'darwin')).toBe(false)
  })
})

describe('renameEntry', () => {
  let dir: string
  beforeEach(() => {
    dir = makeRealTempDir('walph-rename-')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  // Detects whether the volume ignores case (default APFS, NTFS).
  const insensitive = (): boolean => {
    const probe = join(dir, 'probe.tmp')
    writeFileSync(probe, '')
    const result = existsSync(join(dir, 'PROBE.tmp'))
    rmSync(probe)
    return result
  }

  it('renames to a free name', async () => {
    writeFileSync(join(dir, 'a.txt'), 'x')
    expect(await renameEntry(join(dir, 'a.txt'), 'b.txt')).toBe(join(dir, 'b.txt'))
    expect(readFileSync(join(dir, 'b.txt'), 'utf8')).toBe('x')
    expect(existsSync(join(dir, 'a.txt'))).toBe(false)
  })

  it('renames a folder', async () => {
    mkdirSync(join(dir, 'd'))
    writeFileSync(join(dir, 'd', 'f'), 'x')
    await renameEntry(join(dir, 'd'), 'e')
    expect(readFileSync(join(dir, 'e', 'f'), 'utf8')).toBe('x')
  })

  it('refuses and preserves the file that already exists with the target name', async () => {
    writeFileSync(join(dir, 'a.txt'), 'a')
    writeFileSync(join(dir, 'b.txt'), 'b')
    await expect(renameEntry(join(dir, 'a.txt'), 'b.txt')).rejects.toThrow('Já existe: b.txt')
    expect(readFileSync(join(dir, 'b.txt'), 'utf8')).toBe('b')
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('a')
  })

  it('refuses an existing target folder', async () => {
    mkdirSync(join(dir, 'd'))
    mkdirSync(join(dir, 'e'))
    await expect(renameEntry(join(dir, 'd'), 'e')).rejects.toThrow('Já existe: e')
  })

  it('does not overwrite a file that appears between the check and the swap (link fails with EEXIST)', async () => {
    writeFileSync(join(dir, 'a.txt'), 'a')
    writeFileSync(join(dir, 'b.txt'), 'b')
    hideFromLstat = join(dir, 'b.txt')
    try {
      await expect(renameEntry(join(dir, 'a.txt'), 'b.txt')).rejects.toThrow('Já existe: b.txt')
    } finally {
      hideFromLstat = null
    }
    expect(readFileSync(join(dir, 'b.txt'), 'utf8')).toBe('b')
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('a')
  })

  it('error for a missing source item in pt-BR', async () => {
    await expect(renameEntry(join(dir, 'x.txt'), 'y.txt')).rejects.toThrow('não existe mais')
  })

  it.runIf(process.platform === 'darwin' || process.platform === 'win32')(
    'renames only the case of a file and of a folder',
    async () => {
      if (!insensitive()) return
      writeFileSync(join(dir, 'a.txt'), 'x')
      mkdirSync(join(dir, 'folder'))
      expect(await renameEntry(join(dir, 'a.txt'), 'A.txt')).toBe(join(dir, 'A.txt'))
      await renameEntry(join(dir, 'folder'), 'Folder')
      expect(readdirSync(dir).sort()).toEqual(['A.txt', 'Folder'])
    }
  )
})
