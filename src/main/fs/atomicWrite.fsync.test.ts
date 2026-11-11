// @vitest-environment node
import type * as fs from 'node:fs'
import type * as fsp from 'node:fs/promises'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const calls: string[] = []
let failFsyncWith: string | null = null

function failIfRequested(): void {
  if (failFsyncWith) throw Object.assign(new Error('fsync'), { code: failFsyncWith })
}

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>()
  return {
    ...actual,
    fsyncSync: (fd: number) => {
      calls.push('fsyncSync')
      failIfRequested()
      actual.fsyncSync(fd)
    },
    renameSync: (from: string, to: string) => {
      calls.push('renameSync')
      actual.renameSync(from, to)
    }
  }
})

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fsp>()
  return {
    ...actual,
    open: async (...args: Parameters<typeof fsp.open>) => {
      const handle = await actual.open(...args)
      const sync = handle.sync.bind(handle)
      handle.sync = async () => {
        calls.push('handle.sync')
        failIfRequested()
        await sync()
      }
      return handle
    },
    rename: async (from: string, to: string) => {
      calls.push('rename')
      await actual.rename(from, to)
    }
  }
})

const { writeFileAtomic, writeFileAtomicSync } = await import('./atomicWrite')

let dir: string
beforeEach(() => {
  calls.length = 0
  failFsyncWith = null
  dir = mkdtempSync(join(tmpdir(), 'walph-fsync-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('atomic write durability', () => {
  it('async: syncs the temp file before the rename', async () => {
    const path = join(dir, 'a.txt')
    await writeFileAtomic(path, 'hello')
    expect(readFileSync(path, 'utf8')).toBe('hello')
    expect(calls.indexOf('handle.sync')).toBeGreaterThanOrEqual(0)
    expect(calls.indexOf('handle.sync')).toBeLessThan(calls.indexOf('rename'))
  })

  it('sync: fsync of the descriptor before the rename', () => {
    const path = join(dir, 'b.txt')
    writeFileAtomicSync(path, 'hello')
    expect(readFileSync(path, 'utf8')).toBe('hello')
    expect(calls.indexOf('fsyncSync')).toBeGreaterThanOrEqual(0)
    expect(calls.indexOf('fsyncSync')).toBeLessThan(calls.indexOf('renameSync'))
  })

  it.skipIf(process.platform === 'win32')('async: also syncs the folder after the rename', async () => {
    await writeFileAtomic(join(dir, 'c.txt'), 'x')
    expect(calls.filter((c) => c === 'handle.sync')).toHaveLength(2)
    expect(calls.lastIndexOf('handle.sync')).toBeGreaterThan(calls.indexOf('rename'))
  })

  it('sync: does not sync the folder (only the temp file)', () => {
    writeFileAtomicSync(join(dir, 'd.txt'), 'x')
    expect(calls.filter((c) => c === 'fsyncSync')).toHaveLength(1)
    expect(calls.indexOf('fsyncSync')).toBeLessThan(calls.indexOf('renameSync'))
  })

  it.each(['EINVAL', 'ENOTSUP', 'ENOSYS'])(
    'tolerates %s from the temp file fsync and goes on to the rename',
    async (code) => {
      failFsyncWith = code
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const asyncPath = join(dir, 'e.txt')
      await writeFileAtomic(asyncPath, 'async')
      const syncPath = join(dir, 'f.txt')
      writeFileAtomicSync(syncPath, 'sync')
      expect(readFileSync(asyncPath, 'utf8')).toBe('async')
      expect(readFileSync(syncPath, 'utf8')).toBe('sync')
      expect(calls).toContain('rename')
      expect(calls).toContain('renameSync')
      expect(warn.mock.calls.length).toBeLessThanOrEqual(1)
      warn.mockRestore()
    }
  )

  it('another fsync error still fails the write and leaves no temp file', async () => {
    failFsyncWith = 'EIO'
    const asyncPath = join(dir, 'g.txt')
    await expect(writeFileAtomic(asyncPath, 'x')).rejects.toMatchObject({ code: 'EIO' })
    expect(() => writeFileAtomicSync(join(dir, 'h.txt'), 'x')).toThrow()
    expect(existsSync(asyncPath)).toBe(false)
    expect(readdirSync(dir)).toEqual([])
  })
})
