import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitBlame, GitStatus } from '@shared/types'
import { fakeWebContents } from '../testing/fakeIpc'
import { git as g, makeTempRepo, useGitTestEnv } from '../testing/gitRepo'

const harness = await vi.hoisted(async () => (await import('../testing/fakeIpc')).createIpcHarness())
let windowRoot = ''

vi.mock('electron', () => ({ ...harness.electronMock, shell: { trashItem: vi.fn() } }))
vi.mock('../window/windows', () => ({ getWindowRoot: () => windowRoot, windowOf: () => ({}) }))
vi.mock('../window/hiddenMode', () => ({ hiddenWindows: true }))

afterAll(useGitTestEnv())

async function call(channel: string, ...args: unknown[]): Promise<unknown> {
  return harness.invoke(channel, fakeWebContents(), ...args)
}

const lines = (n: number, tag = ''): string => Array.from({ length: n }, (_, i) => `l${i + 1}${tag}\n`).join('')

beforeAll(async () => {
  const { registerGitHandlers } = await import('./git')
  registerGitHandlers()
})

describe('git:stageRanges / git:unstageRanges', () => {
  let dir: string
  let file: string

  beforeEach(() => {
    dir = makeTempRepo({ 'a.txt': lines(20), 'crlf.txt': 'a\r\nb\r\nc\r\n' })
    windowRoot = dir
    file = join(dir, 'a.txt')
  })

  // One repo per test; on Windows the git children may still hold the folder for a moment after exiting.
  afterEach(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))

  const indexOf = (rel: string): string => g(dir, 'show', `:${rel}`)

  it('staging only the selected hunk leaves the other in the working tree', async () => {
    const text = lines(20).replace('l2\n', 'dois\n').replace('l18\n', 'dezoito\n')
    writeFileSync(file, text)
    await call('git:stageRanges', dir, file, [{ from: 2, to: 2 }])
    expect(indexOf('a.txt')).toBe(lines(20).replace('l2\n', 'dois\n'))
    expect(readFileSync(file, 'utf8')).toBe(text)
    expect(g(dir, 'diff', '--name-only')).toBe('a.txt\n')
  })

  it('stages an inserted line and a removal at the end without a trailing newline', async () => {
    writeFileSync(file, `${lines(20)}novo`)
    await call('git:stageRanges', dir, file, [{ from: 21, to: 21 }])
    expect(indexOf('a.txt')).toBe(`${lines(20)}novo`)
    writeFileSync(file, lines(19))
    await call('git:stageRanges', dir, file, [{ from: 19, to: 19 }])
    expect(indexOf('a.txt')).toBe(lines(19))
  })

  it('unstaging only the selected lines reverts them to HEAD', async () => {
    const text = lines(20).replace('l2\n', 'dois\n').replace('l18\n', 'dezoito\n')
    writeFileSync(file, text)
    g(dir, 'add', 'a.txt')
    await call('git:unstageRanges', dir, file, [{ from: 18, to: 18 }])
    expect(indexOf('a.txt')).toBe(lines(20).replace('l2\n', 'dois\n'))
  })

  it('preserves the index CRLF', async () => {
    const crlf = join(dir, 'crlf.txt')
    writeFileSync(crlf, 'a\r\nB\r\nc\r\nd\r\n')
    await call('git:stageRanges', dir, crlf, [{ from: 2, to: 2 }])
    expect(indexOf('crlf.txt')).toBe('a\r\nB\r\nc\r\n')
  })

  it('an untracked file goes whole and unstaging all of a new file removes it from the index', async () => {
    const novo = join(dir, 'novo.txt')
    writeFileSync(novo, 'x\ny\n')
    await call('git:stageRanges', dir, novo, [{ from: 1, to: 1 }])
    expect(indexOf('novo.txt')).toBe('x\ny\n')
    await call('git:unstageRanges', dir, novo, [{ from: 1, to: 2 }])
    expect(g(dir, 'status', '--porcelain', '--', 'novo.txt')).toBe('?? novo.txt\n')
  })

  it('refuses invalid ranges and a binary file', async () => {
    await expect(call('git:stageRanges', dir, file, [])).rejects.toThrow(/Linhas inválidas/)
    await expect(call('git:stageRanges', dir, file, [{ from: 3, to: 1 }])).rejects.toThrow(/Linhas inválidas/)
    const bin = join(dir, 'b.bin')
    writeFileSync(bin, Buffer.from([1, 0, 2, 10]))
    g(dir, 'add', 'b.bin')
    writeFileSync(bin, Buffer.from([1, 0, 3, 10]))
    await expect(call('git:stageRanges', dir, bin, [{ from: 1, to: 1 }])).rejects.toThrow(/binário/)
  })
})

describe('git:blame', () => {
  let dir: string
  let file: string

  beforeAll(() => {
    dir = makeTempRepo({ 'a.txt': 'um\ndois\n' }, { message: 'primeiro' })
    windowRoot = dir
    file = join(dir, 'a.txt')
  })

  afterAll(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))

  it('annotates the disk and, with contents, the unsaved buffer', async () => {
    const disk = (await call('git:blame', dir, file)) as GitBlame
    expect(disk.lines).toEqual([0, 0])
    expect(disk.commits[0]).toMatchObject({ author: 'Walph Test', summary: 'primeiro', uncommitted: false })
    const buffer = (await call('git:blame', dir, file, 'um\nnovo\ndois\n')) as GitBlame
    expect(buffer.lines.map((i) => buffer.commits[i]?.uncommitted)).toEqual([false, true, false])
  })

  it('an untracked file returns null', async () => {
    writeFileSync(join(dir, 'u.txt'), 'x\n')
    expect(await call('git:blame', dir, join(dir, 'u.txt'))).toBeNull()
  })
})

describe('merge in progress', () => {
  let dir: string

  beforeAll(() => {
    dir = makeTempRepo({ 'c.txt': 'base\n' })
    windowRoot = dir
    g(dir, 'switch', '-q', '-c', 'outra')
    writeFileSync(join(dir, 'c.txt'), 'deles\n')
    g(dir, 'commit', '-qam', 'deles')
    g(dir, 'switch', '-q', 'main')
    writeFileSync(join(dir, 'c.txt'), 'nosso\n')
    g(dir, 'commit', '-qam', 'nosso')
    try {
      g(dir, 'merge', 'outra')
    } catch {
      // Expected conflict.
    }
  })

  // One repo per test; on Windows the git children may still hold the folder for a moment after exiting.
  afterAll(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))

  it('status reports the merge, show reads both versions and aborting returns to normal', async () => {
    const status = (await call('git:status', dir)) as GitStatus
    expect(status.operation).toBe('merge')
    expect(status.files).toEqual([{ path: join(dir, 'c.txt'), index: 'U', workingDir: 'U' }])
    expect(await call('git:show', dir, join(dir, 'c.txt'), 'OURS')).toBe('nosso\n')
    expect(await call('git:show', dir, join(dir, 'c.txt'), 'THEIRS')).toBe('deles\n')
    await call('git:abortOperation', dir)
    const after = (await call('git:status', dir)) as GitStatus
    expect(after.operation).toBeUndefined()
    expect(readFileSync(join(dir, 'c.txt'), 'utf8')).toBe('nosso\n')
    await expect(call('git:abortOperation', dir)).rejects.toThrow(/Não há merge/)
  })
})
