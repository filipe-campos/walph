import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readTextDetailedOrNull, readTextOrNull, writeTextAtomic } from './safePath'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'walph-readtext-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('readTextOrNull / readTextDetailedOrNull', () => {
  it('UTF-8 with BOM: text without the BOM (same as fs:readFile)', async () => {
    const file = join(dir, 'a.txt')
    writeFileSync(file, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('olá')]))
    expect(await readTextOrNull(file, 1000)).toBe('olá')
    expect((await readTextDetailedOrNull(file, 1000))?.encoding).toBe('utf8bom')
  })

  it('UTF-16 with BOM is not binary', async () => {
    const file = join(dir, 'b.txt')
    writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('hi', 'utf16le')]))
    expect(await readTextDetailedOrNull(file, 1000)).toEqual({ text: 'hi', encoding: 'utf16le' })
  })

  it('real binary and missing file', async () => {
    const file = join(dir, 'c.bin')
    writeFileSync(file, Buffer.from([1, 0, 2]))
    await expect(readTextOrNull(file, 1000)).rejects.toThrow('binário')
    expect(await readTextOrNull(join(dir, 'nope'), 1000)).toBeNull()
  })

  it('writeTextAtomic keeps the requested encoding', async () => {
    await writeTextAtomic(dir, join(dir, 'd.txt'), 'x', 'utf8bom')
    expect([...readFileSync(join(dir, 'd.txt'))]).toEqual([0xef, 0xbb, 0xbf, 0x78])
  })
})
