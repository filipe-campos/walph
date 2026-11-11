import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { classifyFolder, folderErrorMessage } from './folderState'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'walph-folderstate-'))
})

afterEach(() => {
  chmodSync(dir, 0o700)
  rmSync(dir, { recursive: true, force: true })
})

describe('classifyFolder', () => {
  it('deadline exceeded: inaccessible + timedOut, without waiting for the stuck stat', async () => {
    const never = (): Promise<never> => new Promise(() => undefined)
    const check = await classifyFolder('/volume/travado', { timeoutMs: 20 }, never)
    expect(check.state).toBe('inaccessible')
    expect(check.timedOut).toBe(true)
  })

  it('a root with a pending check does not fire another stat (each caller keeps its deadline)', async () => {
    let calls = 0
    let finish: (value: { isDirectory(): boolean }) => void = () => undefined
    const pending = (): Promise<{ isDirectory(): boolean }> => {
      calls++
      return new Promise((resolve) => (finish = resolve))
    }
    const first = await classifyFolder('/volume/travado', { timeoutMs: 10 }, pending)
    const second = await classifyFolder('/volume/travado', { timeoutMs: 10 }, pending)
    expect([first.timedOut, second.timedOut, calls]).toEqual([true, true, 1])

    const other = classifyFolder('/volume/other', {}, pending)
    expect(calls).toBe(2)
    finish({ isDirectory: () => true })
    expect(await other).toEqual({ state: 'dir' })
  })

  it('a finished check leaves the cache: the next query goes to disk', async () => {
    let calls = 0
    const counting = async (): Promise<{ isDirectory(): boolean }> => {
      calls++
      return { isDirectory: () => true }
    }
    await classifyFolder('/a', {}, counting)
    await classifyFolder('/a', {}, counting)
    expect(calls).toBe(2)
  })

  it('within the deadline returns the normal state', async () => {
    expect(await classifyFolder(dir, { timeoutMs: 1000 })).toEqual({ state: 'dir' })
  })

  it('recognizes a folder', async () => {
    expect(await classifyFolder(dir)).toEqual({ state: 'dir' })
  })

  it('recognizes a folder that does not exist', async () => {
    const check = await classifyFolder(join(dir, 'gone'))
    expect(check.state).toBe('missing')
    expect(check.error).toBeDefined()
  })

  it('treats a file as "file", not as missing', async () => {
    const file = join(dir, 'a.txt')
    writeFileSync(file, 'x')
    expect(await classifyFolder(file)).toEqual({ state: 'file' })
    // ENOTDIR: a path that goes through a file counts as missing
    expect((await classifyFolder(join(file, 'child'))).state).toBe('missing')
  })

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'permission error is "inaccessible" (does not leave the recents)',
    async () => {
      const locked = join(dir, 'locked')
      mkdirSync(join(locked, 'inner'), { recursive: true })
      chmodSync(locked, 0o000)
      const check = await classifyFolder(join(locked, 'inner'))
      chmodSync(locked, 0o700)
      expect(check.state).toBe('inaccessible')
      expect((check.error as NodeJS.ErrnoException).code).toBe('EACCES')
    }
  )
})

describe('folderErrorMessage', () => {
  it('builds the messages in pt-BR', () => {
    expect(folderErrorMessage('/x/proj', { state: 'missing' })).toBe('A pasta "proj" não existe mais.')
    expect(folderErrorMessage('/x/proj', { state: 'file' })).toBe('"proj" não é uma pasta.')
    expect(folderErrorMessage('/x/proj', { state: 'inaccessible', error: new Error('EACCES') })).toBe(
      'Não foi possível acessar a pasta "proj": EACCES'
    )
  })
})
