import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mergeSettings } from '@shared/settings'
import { t } from '@shared/i18n'
import type { SearchOptions, SearchResult } from '@shared/types'
import { fakeWebContents, type FakeWebContents } from '../testing/fakeIpc'
import { makeRealTempDir } from '../testing/testEnv'

const harness = await vi.hoisted(async () => (await import('../testing/fakeIpc')).createIpcHarness())
const state = vi.hoisted(() => ({ rg: '', root: null as string | null }))

vi.mock('electron', () => harness.electronMock)
vi.mock('../window/windows', () => ({ getWindowRoot: () => state.root }))
vi.mock('../settings/state', () => ({ getEffectiveSettings: () => mergeSettings({}, {}) }))
vi.mock('../search/rgPath', () => ({
  get RG() {
    return state.rg
  }
}))

import { killAllSearches, registerSearchHandlers } from './search'

const posix = process.platform !== 'win32'

const options = (extra: Partial<SearchOptions> = {}): SearchOptions => ({
  caseSensitive: false,
  regex: false,
  wholeWord: false,
  ...extra
})

const matchLine = (path: string, lineNumber: number, text: string, start: number, end: number): string =>
  JSON.stringify({
    type: 'match',
    data: {
      path: { text: path },
      lines: { text: `${text}\n` },
      line_number: lineNumber,
      submatches: [{ start, end }]
    }
  })

describe.skipIf(!posix)('search:find / search:replace', () => {
  let tmp: string
  let root: string
  let wc: FakeWebContents
  let argsFile: string
  let outFile: string

  const find = (query: unknown, opts: unknown = options(), where: unknown = root): Promise<SearchResult> =>
    harness.invoke('search:find', wc, where, query, opts) as Promise<SearchResult>
  const rgArgs = (): string[] => readFileSync(argsFile, 'utf8').trimEnd().split('\n')
  const setOutput = (lines: string[]): void => writeFileSync(outFile, lines.map((l) => `${l}\n`).join(''))

  beforeEach(() => {
    tmp = makeRealTempDir('walph-search-')
    root = join(tmp, 'ws')
    mkdirSync(root)
    state.root = root
    argsFile = join(tmp, 'args')
    outFile = join(tmp, 'out')
    state.rg = join(tmp, 'rg')
    writeFileSync(
      state.rg,
      [
        '#!/bin/sh',
        'printf "%s\\n" "$@" > "$FAKE_RG_ARGS"',
        '[ -n "$FAKE_RG_SLEEP" ] && sleep "$FAKE_RG_SLEEP"',
        '[ -f "$FAKE_RG_OUT" ] && cat "$FAKE_RG_OUT"',
        '[ -n "$FAKE_RG_ERR" ] && printf "%s\\n" "$FAKE_RG_ERR" >&2',
        'exit "${FAKE_RG_CODE:-0}"',
        ''
      ].join('\n')
    )
    chmodSync(state.rg, 0o755)
    vi.stubEnv('FAKE_RG_ARGS', argsFile)
    vi.stubEnv('FAKE_RG_OUT', outFile)
    wc = fakeWebContents()
    harness.reset()
    registerSearchHandlers()
  })

  afterEach(() => {
    killAllSearches()
    rmSync(tmp, { recursive: true, force: true })
  })

  it('only searches the folder of the view itself and validates the arguments before spawning rg', async () => {
    await expect(find('x', options(), join(tmp, 'outra'))).rejects.toThrow(t().search.errors.onlyOwnFolder)
    await expect(find('x', options(), 42)).rejects.toThrow(t().search.errors.onlyOwnFolder)
    state.root = null
    await expect(find('x')).rejects.toThrow(t().search.errors.onlyOwnFolder)
    state.root = root
    await expect(find(7)).rejects.toThrow(t().search.errors.invalidQuery)
    await expect(find('x', { caseSensitive: 'sim' })).rejects.toThrow(t().search.errors.invalidOptions)
    expect(() => readFileSync(argsFile)).toThrow()
  })

  it('builds the arguments: "--" before the query, which never becomes an option, and "." last', async () => {
    await find('--files', options())
    const args = rgArgs()
    expect(args.slice(-3)).toEqual(['--', '--files', '.'])
    expect(args).toContain('--json')
    expect(args).toContain('--ignore-case')
    expect(args).toContain('--fixed-strings')
    expect(args).not.toContain('--word-regexp')
    expect(args.slice(0, 3)).toEqual(['--no-config', '--hidden', '--glob=!.git'])
  })

  it('options: match case, regex and whole word change the flags', async () => {
    await find('a.b', options({ caseSensitive: true, regex: true, wholeWord: true }))
    const args = rgArgs()
    expect(args).toContain('--case-sensitive')
    expect(args).not.toContain('--ignore-case')
    expect(args).not.toContain('--fixed-strings')
    expect(args).toContain('--word-regexp')
  })

  it('user include and exclude become globs before "--"', async () => {
    await find('x', options({ include: 'src', exclude: 'dist' }))
    const args = rgArgs()
    const dashes = args.indexOf('--')
    const globs = args.slice(0, dashes).filter((a) => a.startsWith('--glob=') && a !== '--glob=!.git')
    expect(globs.some((g) => g.startsWith('--glob=!') && g.includes('dist'))).toBe(true)
    expect(globs.some((g) => !g.startsWith('--glob=!') && g.includes('src'))).toBe(true)
  })

  it('result: sorted absolute paths and columns in characters, not UTF-8 bytes', async () => {
    setOutput([
      matchLine('z.txt', 1, 'zeta', 0, 4),
      matchLine('a/b.txt', 3, 'ação x', 7, 8),
      '{"type":"summary","data":{}}',
      'not json'
    ])
    const result = await find('x')
    expect(result.error).toBeUndefined()
    expect(result.truncated).toBe(false)
    expect(result.totalMatches).toBe(2)
    expect(result.files.map((f) => f.path)).toEqual([join(root, 'a', 'b.txt'), join(root, 'z.txt')])
    expect(result.files[0].matches).toEqual([{ line: 3, column: 5, length: 1, text: 'ação x' }])
  })

  it('stops at the 2000 match cap and marks it as truncated', async () => {
    setOutput(Array.from({ length: 2500 }, (_, i) => matchLine('a.txt', i + 1, 'x', 0, 1)))
    const result = await find('x')
    expect(result.totalMatches).toBe(2000)
    expect(result.truncated).toBe(true)
    expect(result.files[0].matches).toHaveLength(2000)
  })

  it('code 1 (nothing found) returns empty and without an error', async () => {
    vi.stubEnv('FAKE_RG_CODE', '1')
    await expect(find('x')).resolves.toEqual({ files: [], totalMatches: 0, truncated: false, error: undefined })
  })

  it('invalid regex (code 2) becomes a regex message; another error carries the rg text', async () => {
    vi.stubEnv('FAKE_RG_CODE', '2')
    vi.stubEnv('FAKE_RG_ERR', 'regex parse error: unclosed group')
    expect((await find('(', options({ regex: true }))).error).toBe(
      t().search.errors.invalidRegex('regex parse error: unclosed group')
    )
    vi.stubEnv('FAKE_RG_ERR', 'IO error for operation')
    expect((await find('x')).error).toBe(t().search.errors.failed('IO error for operation'))
    vi.stubEnv('FAKE_RG_ERR', '')
    expect((await find('x')).error).toBe(t().search.errors.failedGeneric)
  })

  it('missing ripgrep becomes a translated error, not an exception', async () => {
    state.rg = join(tmp, 'nao-existe')
    const result = await find('x')
    expect(result).toEqual({ files: [], totalMatches: 0, truncated: false, error: t().search.errors.rgNotFound })
  })

  it('a new search from the same view cancels the previous one, which resolves cancelled', async () => {
    vi.stubEnv('FAKE_RG_SLEEP', '30')
    const first = find('a')
    await vi.waitFor(() => expect(readFileSync(argsFile, 'utf8')).toContain('a'))
    vi.stubEnv('FAKE_RG_SLEEP', '')
    const second = find('b')
    await expect(first).resolves.toEqual({ files: [], totalMatches: 0, truncated: false, cancelled: true })
    await expect(second).resolves.toMatchObject({ totalMatches: 0, error: undefined })
  })

  it('reloading the view cancels the running search', async () => {
    vi.stubEnv('FAKE_RG_SLEEP', '30')
    const running = find('a')
    await vi.waitFor(() => expect(readFileSync(argsFile, 'utf8')).toContain('a'))
    wc.emit('did-navigate')
    await expect(running).resolves.toMatchObject({ cancelled: true })
  })

  it('searches from different views do not cancel each other', async () => {
    vi.stubEnv('FAKE_RG_SLEEP', '1')
    const other = fakeWebContents()
    const a = find('a')
    const b = harness.invoke('search:find', other, root, 'b', options()) as Promise<SearchResult>
    await expect(a).resolves.not.toHaveProperty('cancelled')
    await expect(b).resolves.not.toHaveProperty('cancelled')
  })

  describe('search:replace', () => {
    const request = (file: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
      query: 'foo',
      replacement: 'bar',
      options: options({ caseSensitive: true }),
      files: [{ path: file, matches: [{ line: 1, column: 0, length: 3, text: 'foo' }] }],
      ...extra
    })

    it('replaces inside the view folder', async () => {
      const file = join(root, 'a.txt')
      writeFileSync(file, 'foo\n')
      const result = await harness.invoke('search:replace', wc, root, request(file))
      expect(result).toEqual({ files: [{ path: file, replaced: 1, skipped: [] }] })
      expect(readFileSync(file, 'utf8')).toBe('bar\n')
    })

    it('refuses another folder and a malformed request without touching the disk', async () => {
      const file = join(root, 'a.txt')
      writeFileSync(file, 'foo\n')
      await expect(harness.invoke('search:replace', wc, tmp, request(file))).rejects.toThrow(
        t().search.errors.onlyOwnFolder
      )
      await expect(harness.invoke('search:replace', wc, root, { query: 'foo' })).rejects.toThrow(
        t().search.errors.invalidReplace
      )
      expect(readFileSync(file, 'utf8')).toBe('foo\n')
    })

    it('a file outside the folder becomes an error in the result and is not written', async () => {
      const outside = join(tmp, 'fora.txt')
      writeFileSync(outside, 'foo\n')
      const result = (await harness.invoke('search:replace', wc, root, request(outside))) as {
        files: { error?: string; replaced: number }[]
      }
      expect(result.files[0].replaced).toBe(0)
      expect(result.files[0].error).toBeTruthy()
      expect(readFileSync(outside, 'utf8')).toBe('foo\n')
    })
  })
})
