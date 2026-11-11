import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeRealTempDir } from '../testing/testEnv'

let userData = ''

vi.mock('electron', () => ({ app: { getPath: () => userData } }))

import { state } from './state'
import { resolveSettingsWriteTarget, writeSetting } from './writeSetting'

describe('writeSetting', () => {
  let root: string
  const userFile = (): string => join(userData, 'settings.json')

  beforeEach(() => {
    userData = makeRealTempDir('walph-ws-ud-')
    root = makeRealTempDir('walph-ws-root-')
  })

  afterEach(() => {
    state.lastTexts.clear()
    state.problems.clear()
    rmSync(userData, { recursive: true, force: true })
    rmSync(root, { recursive: true, force: true })
  })

  it('writes the text computed from the current one and creates the missing file', async () => {
    const seen: (string | null)[] = []
    await writeSetting({ kind: 'user' }, 'user', (current) => {
      seen.push(current)
      return '{ "editor.fontSize": 18 }\n'
    })
    expect(seen).toEqual([null])
    expect(readFileSync(userFile(), 'utf8')).toBe('{ "editor.fontSize": 18 }\n')
    expect(readdirSync(userData)).toEqual(['settings.json'])
  })

  it('compute returning null or the same text neither creates nor touches the file', async () => {
    await writeSetting({ kind: 'user' }, 'user', () => null)
    expect(existsSync(userFile())).toBe(false)
    writeFileSync(userFile(), '{}\n')
    utimesSync(userFile(), 1_500_000_000, 1_500_000_000)
    const before = statSync(userFile())
    await writeSetting({ kind: 'user' }, 'user', (current) => current)
    const after = statSync(userFile())
    expect(readFileSync(userFile(), 'utf8')).toBe('{}\n')
    expect(after.mtimeMs).toBe(before.mtimeMs)
    expect(after.ino).toBe(before.ino)
  })

  it('concurrent writes are queued: each one sees the result of the previous one', async () => {
    const seen: (string | null)[] = []
    const set = (n: number) => (current: string | null) => {
      seen.push(current)
      return `{ "editor.fontSize": ${n} }\n`
    }
    await Promise.all([10, 11, 12, 13].map((n) => writeSetting({ kind: 'user' }, 'user', set(n))))
    expect(seen).toEqual([
      null,
      '{ "editor.fontSize": 10 }\n',
      '{ "editor.fontSize": 11 }\n',
      '{ "editor.fontSize": 12 }\n'
    ])
    expect(readFileSync(userFile(), 'utf8')).toBe('{ "editor.fontSize": 13 }\n')
  })

  it('a failed write does not block the next one', async () => {
    const failing = writeSetting({ kind: 'user' }, 'user', () => {
      throw new Error('compute failed')
    })
    const next = writeSetting({ kind: 'user' }, 'user', () => '{}\n')
    await expect(failing).rejects.toThrow('compute failed')
    await expect(next).resolves.toBeUndefined()
    expect(readFileSync(userFile(), 'utf8')).toBe('{}\n')
  })

  it('a file with a syntax error is refused with the reason and is not changed', async () => {
    writeFileSync(userFile(), '{ "editor.fontSize": ')
    const compute = vi.fn(() => '{}')
    await expect(writeSetting({ kind: 'user' }, 'user', compute)).rejects.toThrow(/Corrija o settings\.json/)
    expect(compute).not.toHaveBeenCalled()
    expect(readFileSync(userFile(), 'utf8')).toBe('{ "editor.fontSize": ')
  })

  it('a user settings.json that is a folder becomes a translated read error', async () => {
    mkdirSync(userFile())
    await expect(writeSetting({ kind: 'user' }, 'user', () => '{}')).rejects.toThrow(/settings\.json.*EISDIR/)
  })

  it('workspace: creates .walph/ in the open folder', async () => {
    await writeSetting({ kind: 'workspace', root }, 'workspace', () => '{}\n')
    expect(readFileSync(join(root, '.walph', 'settings.json'), 'utf8')).toBe('{}\n')
  })

  it.skipIf(process.platform === 'win32')(
    'workspace: a .walph pointing outside is refused before creating or writing anything',
    async () => {
      const outside = makeRealTempDir('walph-ws-out-')
      try {
        symlinkSync(outside, join(root, '.walph'), 'dir')
        await expect(writeSetting({ kind: 'workspace', root }, 'workspace', () => '{}\n')).rejects.toThrow(
          /fora da pasta/
        )
        await expect(resolveSettingsWriteTarget({ kind: 'workspace', root })).rejects.toThrow(/fora da pasta/)
        expect(readdirSync(outside)).toEqual([])
      } finally {
        rmSync(outside, { recursive: true, force: true })
      }
    }
  )

  it.skipIf(process.platform === 'win32')(
    'user: a settings.json that is a link (dotfiles) stays a link and the target gets the text',
    async () => {
      const dotfiles = makeRealTempDir('walph-ws-dot-')
      try {
        const target = join(dotfiles, 'settings.json')
        writeFileSync(target, '{}\n')
        symlinkSync(target, userFile())
        await writeSetting({ kind: 'user' }, 'user', () => '{ "editor.fontSize": 20 }\n')
        expect(readFileSync(target, 'utf8')).toBe('{ "editor.fontSize": 20 }\n')
        expect(readFileSync(userFile(), 'utf8')).toBe('{ "editor.fontSize": 20 }\n')
        expect(readdirSync(dotfiles)).toEqual(['settings.json'])
      } finally {
        rmSync(dotfiles, { recursive: true, force: true })
      }
    }
  )
})
