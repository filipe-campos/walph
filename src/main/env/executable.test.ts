import { describe, expect, it } from 'vitest'
import { assertRunnableBinary, resolveExecutable, type ExecutableMessages } from './executable'

const messages: ExecutableMessages = {
  notFound: (v) => `not found ${v}`,
  notInPath: (v) => `${v} outside the PATH`,
  windowsScript: (p) => `script ${p}`
}
const files =
  (...paths: string[]) =>
  (p: string) =>
    paths.includes(p)

describe('resolveExecutable', () => {
  it('bare name comes from the PATH', () => {
    expect(
      resolveExecutable('claude', '/usr/bin:/opt/bin', {
        messages,
        platform: 'linux',
        isFile: files('/opt/bin/claude')
      })
    ).toBe('/opt/bin/claude')
  })
  it('existing absolute path is used as is, without looking at the PATH', () => {
    expect(
      resolveExecutable('/opt/bin/claude', '', { messages, platform: 'linux', isFile: files('/opt/bin/claude') })
    ).toBe('/opt/bin/claude')
  })
  it('name outside the PATH throws ENOENT with notInPath', () => {
    try {
      resolveExecutable('claude', '/usr/bin', { messages, platform: 'linux', isFile: files() })
      expect.unreachable()
    } catch (err) {
      expect((err as NodeJS.ErrnoException).code).toBe('ENOENT')
      expect((err as Error).message).toBe('claude outside the PATH')
    }
  })
  it('missing absolute path throws ENOENT with notFound', () => {
    try {
      resolveExecutable('/x/claude', '', { messages, platform: 'linux', isFile: files() })
      expect.unreachable()
    } catch (err) {
      expect((err as NodeJS.ErrnoException).code).toBe('ENOENT')
      expect((err as Error).message).toBe('not found /x/claude')
    }
  })
  it('without notInPath the name outside the PATH uses notFound', () => {
    expect(() =>
      resolveExecutable('x', '/a', {
        messages: { notFound: (v) => `nf ${v}`, windowsScript: () => '' },
        platform: 'linux',
        isFile: files()
      })
    ).toThrow('nf x')
  })
  it('Windows: a path with a drive is absolute and .exe is preferred over .cmd', () => {
    const p = 'C:\\Docker\\docker.exe'
    expect(resolveExecutable(p, '', { messages, platform: 'win32', isFile: files(p) })).toBe(p)
    const both = files('C:\\b\\claude.cmd', 'C:\\b\\claude.exe')
    expect(resolveExecutable('claude', 'C:\\b', { messages, platform: 'win32', isFile: both })).toBe(
      'C:\\b\\claude.exe'
    )
  })
  it('Windows: rejects .cmd/.bat', () => {
    const isFile = files('C:\\c\\claude.cmd')
    expect(() => resolveExecutable('claude', 'C:\\c', { messages, platform: 'win32', isFile })).toThrow('script')
    expect(() => resolveExecutable('C:\\c\\claude.cmd', '', { messages, platform: 'win32', isFile })).toThrow('script')
  })
})

describe('assertRunnableBinary', () => {
  it.each(['/a/cli.js', '/a/cli.mjs', '/a/cli.cjs', '/A/CLI.JS'])('rejects %s', (file) => {
    expect(() => assertRunnableBinary(file, () => 'script')).toThrow('script')
  })
  it.each(['/a/claude', '/a/claude.exe', '/a/cli.json'])('accepts %s', (file) => {
    expect(() => assertRunnableBinary(file, () => 'script')).not.toThrow()
  })
})
