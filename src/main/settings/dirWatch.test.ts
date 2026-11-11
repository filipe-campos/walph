import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { watchFileInDir, watchNestedFile, type DirWatch } from './dirWatch'
import { makeRealTempDir } from '../testing/testEnv'

describe('dirWatch', () => {
  let dir: string
  let watch: DirWatch | null = null
  beforeEach(() => {
    dir = makeRealTempDir('walph-dirwatch-')
  })
  afterEach(() => {
    watch?.close()
    watch = null
    rmSync(dir, { recursive: true, force: true })
  })

  // Atomic write like the app's and the editors': tmp + rename over the file.
  const atomicWrite = (path: string, text: string): void => {
    writeFileSync(`${path}.tmp`, text)
    renameSync(`${path}.tmp`, path)
  }

  it('sees two consecutive atomic writes, with no wait between them, and rereads the last one', async () => {
    const file = join(dir, 'settings.json')
    const seen: string[] = []
    watch = watchFileInDir(dir, 'settings.json', () => seen.push(readFileSync(file, 'utf8')))
    // The native watcher takes a few ms to arm (FSEvents); the app starts it at boot, well before any write.
    await new Promise((r) => setTimeout(r, 100))
    atomicWrite(file, '1')
    atomicWrite(file, '2')
    await vi.waitFor(() => expect(seen.at(-1)).toBe('2'))
    atomicWrite(file, '3')
    await vi.waitFor(() => expect(seen.at(-1)).toBe('3'))
  })

  it('ignores other entries of the folder', async () => {
    const onChange = vi.fn()
    watch = watchFileInDir(dir, 'settings.json', onChange)
    await new Promise((r) => setTimeout(r, 100))
    writeFileSync(join(dir, 'other.txt'), 'x')
    await new Promise((r) => setTimeout(r, 150))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('detects the creation of <folder>/<file> when the folder does not exist yet', async () => {
    const onChange = vi.fn()
    watch = watchNestedFile(dir, '.walph', 'settings.json', onChange)
    // Same wait for the watcher to arm as the other cases: without it the mkdir may land before FSEvents starts
    // (flaky).
    await new Promise((r) => setTimeout(r, 100))
    mkdirSync(join(dir, '.walph'))
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled())
    onChange.mockClear()
    // Once created, the folder is watched: writing the file notifies.
    await new Promise((r) => setTimeout(r, 100))
    atomicWrite(join(dir, '.walph', 'settings.json'), '{}')
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled())
  })

  it('watches again when the folder is deleted and recreated', async () => {
    mkdirSync(join(dir, '.walph'))
    const onChange = vi.fn()
    watch = watchNestedFile(dir, '.walph', 'settings.json', onChange)
    rmSync(join(dir, '.walph'), { recursive: true })
    mkdirSync(join(dir, '.walph'))
    await new Promise((r) => setTimeout(r, 200))
    onChange.mockClear()
    writeFileSync(join(dir, '.walph', 'settings.json'), '{}')
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled())
  })

  it('does not throw with a missing folder and close is idempotent', () => {
    expect(() => {
      watch = watchFileInDir(join(dir, 'none'), 'x', () => undefined)
      watch.close()
      watch.close()
      watch = watchNestedFile(join(dir, 'none'), 'a', 'b', () => undefined)
    }).not.toThrow()
  })
})
