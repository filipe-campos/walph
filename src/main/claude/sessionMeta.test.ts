import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_META_ENTRIES,
  SessionMetaStore,
  TITLE_MAX_CHARS,
  applyMetaPatch,
  isSessionId,
  parseMetaPatch,
  parseSessionMeta,
  sanitizeTitle,
  serializeSessionMeta
} from './sessionMeta'

describe('sanitizeTitle', () => {
  it('removes controls and bidi, collapses spaces and trims', () => {
    expect(sanitizeTitle('  Fix\n the\tcheckout\u202E  ')).toBe('Fix the checkout')
  })
  it('empty, only controls or non-text become null', () => {
    expect(sanitizeTitle('   ')).toBeNull()
    expect(sanitizeTitle('\u0000\u202E')).toBeNull()
    expect(sanitizeTitle(42)).toBeNull()
  })
  it('caps the length without splitting an emoji', () => {
    const t = sanitizeTitle('a'.repeat(TITLE_MAX_CHARS - 1) + '😀😀')
    expect(t).not.toBeNull()
    expect((t as string).length).toBeLessThanOrEqual(TITLE_MAX_CHARS)
    expect(/[\ud800-\udbff]$/.test(t as string)).toBe(false)
  })
})

describe('isSessionId', () => {
  it('accepts a UUID and rejects the rest', () => {
    expect(isSessionId('0b7e60a1-aaaa-4bbb-8ccc-123456789abc')).toBe(true)
    expect(isSessionId('../x')).toBe(false)
    expect(isSessionId('')).toBe(false)
    expect(isSessionId(1)).toBe(false)
  })
})

describe('parseMetaPatch', () => {
  it('accepts favorite and title (sanitized; null/empty = clear)', () => {
    expect(parseMetaPatch({ favorite: true, title: ' Hi ' })).toEqual({ favorite: true, title: 'Hi' })
    expect(parseMetaPatch({ title: null })).toEqual({ title: null })
    expect(parseMetaPatch({ title: '  ' })).toEqual({ title: null })
    expect(parseMetaPatch({})).toEqual({})
  })
  it('rejects invalid shapes in pt-BR', () => {
    expect(() => parseMetaPatch(null)).toThrow('inválido')
    expect(() => parseMetaPatch({ favorite: 'yes' })).toThrow('inválido')
    expect(() => parseMetaPatch({ title: 3 })).toThrow('inválido')
  })
})

describe('parseSessionMeta / applyMetaPatch', () => {
  it('is tolerant of garbage', () => {
    expect(parseSessionMeta(null).size).toBe(0)
    expect(parseSessionMeta({ sessions: [] }).size).toBe(0)
    const meta = parseSessionMeta({
      sessions: {
        'a-1': { favorite: true, title: 'X\u0000' },
        '../b': { favorite: true },
        'c-3': { favorite: false },
        'd-4': 'x',
        __proto__: { favorite: true }
      }
    })
    expect([...meta.keys()]).toEqual(['a-1'])
    expect(meta.get('a-1')).toEqual({ favorite: true, title: 'X' })
  })

  it('merges the patch and removes empty entries', () => {
    let m = applyMetaPatch(new Map(), 'a-1', { favorite: true })
    m = applyMetaPatch(m, 'a-1', { title: 'Name' })
    expect(m.get('a-1')).toEqual({ favorite: true, title: 'Name' })
    m = applyMetaPatch(m, 'a-1', { title: null })
    expect(m.get('a-1')).toEqual({ favorite: true })
    m = applyMetaPatch(m, 'a-1', { favorite: false })
    expect(m.has('a-1')).toBe(false)
  })

  it('does not mutate the original map and respects the cap', () => {
    const base = new Map([['a-1', { favorite: true }]])
    applyMetaPatch(base, 'b-2', { favorite: true })
    expect(base.size).toBe(1)
    let big = new Map<string, { favorite: boolean }>()
    for (let i = 0; i < MAX_META_ENTRIES; i++) big.set(`s-${i}`, { favorite: true })
    big = applyMetaPatch(big, 'new', { favorite: true })
    expect(big.size).toBe(MAX_META_ENTRIES)
    expect(big.has('s-0')).toBe(false)
    expect(big.has('new')).toBe(true)
  })

  it('parse above the cap keeps the last entries', () => {
    const sessions: Record<string, unknown> = {}
    for (let i = 0; i < MAX_META_ENTRIES + 3; i++) sessions[`s-${i}`] = { favorite: true }
    const meta = parseSessionMeta({ sessions })
    expect(meta.size).toBe(MAX_META_ENTRIES)
    expect(meta.has('s-0')).toBe(false)
    expect(meta.has(`s-${MAX_META_ENTRIES + 2}`)).toBe(true)
  })

  it('serializes and reads back equal', () => {
    const m = applyMetaPatch(new Map(), 'a-1', { favorite: true, title: 'T' })
    expect(parseSessionMeta(serializeSessionMeta(m))).toEqual(m)
  })
})

describe('SessionMetaStore', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'walph-meta-'))
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it('writes, reads back in another instance and merges concurrent changes', async () => {
    const store = new SessionMetaStore(join(dir, 'claude'))
    await Promise.all([
      store.update('/proj', 'a-1', { favorite: true }),
      store.update('/proj', 'b-2', { title: 'Two' }),
      store.update('/proj', 'a-1', { title: 'One' })
    ])
    const again = await new SessionMetaStore(join(dir, 'claude')).load('/proj')
    expect(again.get('a-1')).toEqual({ favorite: true, title: 'One' })
    expect(again.get('b-2')).toEqual({ favorite: false, title: 'Two' })
    expect((await new SessionMetaStore(join(dir, 'claude')).load('/other')).size).toBe(0)
  })

  it('a corrupted file counts as empty and is rewritten valid', async () => {
    const store = new SessionMetaStore(dir)
    await store.update('/proj', 'a-1', { favorite: true })
    const { readdir } = await import('node:fs/promises')
    const [file] = await readdir(dir)
    await writeFile(join(dir, file), '{ broken')
    expect((await store.load('/proj')).size).toBe(0)
    await store.update('/proj', 'z-9', { favorite: true })
    expect(JSON.parse(await readFile(join(dir, file), 'utf8')).sessions).toEqual({ 'z-9': { favorite: true } })
  })

  it('copy takes favorite and title to the new id and ignores a source without an entry', async () => {
    const store = new SessionMetaStore(dir)
    await store.update('/p', 'a-1', { favorite: true, title: 'Name' })
    await store.copy('/p', 'a-1', 'b-2')
    await store.copy('/p', 'none', 'c-3')
    const meta = await store.load('/p')
    expect(meta.get('b-2')).toEqual({ favorite: true, title: 'Name' })
    expect(meta.get('a-1')).toEqual({ favorite: true, title: 'Name' })
    expect(meta.has('c-3')).toBe(false)
  })

  it('creates the folder if it does not exist', async () => {
    const store = new SessionMetaStore(join(dir, 'a', 'b'))
    await store.update('/p', 'a-1', { favorite: true })
    await mkdir(join(dir, 'a', 'b'), { recursive: true })
    expect((await store.load('/p')).get('a-1')).toEqual({ favorite: true })
  })
})
