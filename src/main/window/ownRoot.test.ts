import type { WebContents } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const roots = new Map<unknown, string | null>()
vi.mock('./windows', () => ({ getWindowRoot: (wc: unknown) => roots.get(wc) ?? null }))

import { UserError } from '../errors'
import { assertOwnRoot, matchOwnRoot, ownRootOf, requireViewRoot } from './ownRoot'

const wc = { id: 1 } as unknown as WebContents

describe('ownRoot', () => {
  beforeEach(() => roots.clear())

  it("matchOwnRoot returns main's spelling when it matches", () => {
    expect(matchOwnRoot('/a/b', '/a/b')).toBe('/a/b')
    expect(matchOwnRoot('/a/b', '/a/b/')).toBe('/a/b')
  })

  it('matchOwnRoot rejects a different, empty or non-string folder', () => {
    expect(matchOwnRoot('/a/b', '/a/c')).toBeNull()
    expect(matchOwnRoot(null, '/a/b')).toBeNull()
    expect(matchOwnRoot('/a/b', undefined)).toBeNull()
    expect(matchOwnRoot('/a/b', 42)).toBeNull()
  })

  it('ownRootOf queries the view folder', () => {
    roots.set(wc, '/a/b')
    expect(ownRootOf(wc, '/a/b')).toBe('/a/b')
    expect(ownRootOf(wc, '/x')).toBeNull()
  })

  it('assertOwnRoot throws the caller message', () => {
    roots.set(wc, '/a/b')
    expect(assertOwnRoot(wc, '/a/b', 'error')).toBe('/a/b')
    expect(() => assertOwnRoot(wc, '/x', 'error')).toThrow('error')
    expect(() => assertOwnRoot(wc, null, 'error')).toThrow('error')
    roots.clear()
    expect(() => assertOwnRoot(wc, '/a/b', 'error')).toThrow('error')
  })

  it('assertOwnRoot throws UserError', () => {
    expect(() => assertOwnRoot(wc, '/x', 'error')).toThrow(UserError)
  })

  it('requireViewRoot returns the view folder or throws UserError with the requested message', () => {
    roots.set(wc, '/a/b')
    expect(requireViewRoot(wc)).toBe('/a/b')
    roots.clear()
    expect(() => requireViewRoot(wc)).toThrow(UserError)
    expect(() => requireViewRoot(wc)).toThrow('Nenhuma pasta aberta.')
    expect(() => requireViewRoot(wc, 'open a folder')).toThrow('open a folder')
  })
})
