import { describe, expect, it, vi } from 'vitest'
import { join, resolve } from 'node:path'

vi.mock('electron', () => ({
  app: { isPackaged: false },
  protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() }
}))

const { resolveAppRequest, mimeOf } = await import('./appProtocol')

const root = resolve('/tmp/walph-renderer')

describe('resolveAppRequest', () => {
  it('serves files and the root as index.html', () => {
    expect(resolveAppRequest('app://walph/assets/a.js', root)).toBe(join(root, 'assets', 'a.js'))
    expect(resolveAppRequest('app://walph/', root)).toBe(join(root, 'index.html'))
    expect(resolveAppRequest('app://walph/index.html?x=1#h', root)).toBe(join(root, 'index.html'))
  })
  it('rejects host, scheme and directory traversal', () => {
    expect(resolveAppRequest('app://other/index.html', root)).toBeNull()
    expect(resolveAppRequest('file:///etc/passwd', root)).toBeNull()
    // The URL parser already collapses `..`: the result never leaves the folder.
    expect(resolveAppRequest('app://walph/../secret', root)).toBe(join(root, 'secret'))
    expect(resolveAppRequest('app://walph/%2e%2e/secret', root)).toBe(join(root, 'secret'))
    expect(resolveAppRequest('app://walph/a/%2e%2e%2f%2e%2e/x', root)).toBeNull()
    expect(resolveAppRequest('app://walph/a%5c..%5cb', root)).toBeNull()
    expect(resolveAppRequest('app://walph/a%00b', root)).toBeNull()
    expect(resolveAppRequest('not a url', root)).toBeNull()
  })
})

describe('mimeOf', () => {
  it('covers fonts, wasm and falls back to octet-stream', () => {
    expect(mimeOf('x.woff2')).toBe('font/woff2')
    expect(mimeOf('x.ttf')).toBe('font/ttf')
    expect(mimeOf('x.wasm')).toBe('application/wasm')
    expect(mimeOf('x.bin')).toBe('application/octet-stream')
  })
})
