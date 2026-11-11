import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AtomicWriter } from './asyncWriter'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'walph-writer-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 50))
const read = (p: string): unknown => JSON.parse(readFileSync(p, 'utf8'))

describe('AtomicWriter', () => {
  it('writes asynchronously and the last write wins', async () => {
    const w = new AtomicWriter()
    const file = join(dir, 'sub', 'a.json')
    w.write(file, { n: 1 })
    w.write(file, { n: 2 })
    w.write(file, { n: 3 })
    expect(w.isPending(file)).toBe(true)
    await vi.waitFor(() => expect(w.isPending(file)).toBe(false))
    expect(read(file)).toEqual({ n: 3 })
    expect(readdirSync(join(dir, 'sub'))).toEqual(['a.json'])
  })

  it('flushSync writes immediately and the in-flight write does not overwrite it with stale data', async () => {
    const w = new AtomicWriter()
    const file = join(dir, 'b.json')
    w.write(file, { n: 1 })
    w.write(file, { n: 2 })
    w.flushSync(file)
    expect(read(file)).toEqual({ n: 2 })
    await settle()
    expect(read(file)).toEqual({ n: 2 })
    expect(readdirSync(dir)).toEqual(['b.json'])
  })

  it('flushSync without an argument covers every pending file', () => {
    const w = new AtomicWriter()
    w.write(join(dir, 'x.json'), 1)
    w.write(join(dir, 'y.json'), 2)
    w.flushSync()
    expect(read(join(dir, 'x.json'))).toBe(1)
    expect(read(join(dir, 'y.json'))).toBe(2)
  })
})
