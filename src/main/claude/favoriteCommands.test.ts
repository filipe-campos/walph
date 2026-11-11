import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sessionFileName } from '../session/sessionFile'
import { FavoriteCommandsStore } from './favoriteCommands'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'walph-favcmds-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('FavoriteCommandsStore', () => {
  it('starts empty and returns what it wrote, per folder', async () => {
    const store = new FavoriteCommandsStore(dir)
    expect(await store.load('/repo/a')).toEqual([])
    await store.save('/repo/a', [{ name: 'review', icon: 'check' }])
    expect(await store.load('/repo/a')).toEqual([{ name: 'review', icon: 'check' }])
    expect(await store.load('/repo/b')).toEqual([])
    const file = JSON.parse(await readFile(join(dir, sessionFileName('/repo/a')), 'utf8'))
    expect(file).toEqual({ version: 1, commands: [{ name: 'review', icon: 'check' }] })
  })

  it('a corrupt file or one with invalid items is read tolerantly', async () => {
    const store = new FavoriteCommandsStore(dir)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, sessionFileName('/repo/a')), '{ not json')
    expect(await store.load('/repo/a')).toEqual([])
    await writeFile(
      join(dir, sessionFileName('/repo/a')),
      JSON.stringify({
        commands: [
          { name: 'ok', icon: 'bolt' },
          { name: 'bad', icon: 'x' }
        ]
      })
    )
    expect(await store.load('/repo/a')).toEqual([{ name: 'ok', icon: 'bolt' }])
  })

  it('consecutive writes of the same folder are not lost', async () => {
    const store = new FavoriteCommandsStore(dir)
    await Promise.all([
      store.save('/repo/a', [{ name: 'a', icon: 'bolt' }]),
      store.save('/repo/a', [
        { name: 'a', icon: 'bolt' },
        { name: 'b', icon: 'play' }
      ])
    ])
    expect(await store.load('/repo/a')).toEqual([
      { name: 'a', icon: 'bolt' },
      { name: 'b', icon: 'play' }
    ])
  })
})
