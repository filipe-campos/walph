import { describe, expect, it } from 'vitest'
import { isLinkableHref, parseFileRef, parseHref } from './claudePaths'

const root = '/w/p'

describe('parseFileRef', () => {
  it('recognizes paths with line and column', () => {
    expect(parseFileRef('src/app.ts', root)).toEqual({ path: '/w/p/src/app.ts' })
    expect(parseFileRef('src/app.ts:42', root)).toEqual({ path: '/w/p/src/app.ts', line: 42 })
    expect(parseFileRef('src/app.ts:42:7', root)).toEqual({ path: '/w/p/src/app.ts', line: 42, column: 7 })
    expect(parseFileRef('src/app.ts#L10-20', root)).toEqual({ path: '/w/p/src/app.ts', line: 10 })
    expect(parseFileRef('package.json', root)).toEqual({ path: '/w/p/package.json' })
    expect(parseFileRef('/w/p/a/b.ts', root)).toEqual({ path: '/w/p/a/b.ts' })
  })
  it('rejects what is not a path', () => {
    for (const text of [
      'console.log',
      'foo',
      'a b.ts',
      'https://x.dev/a.ts',
      'src/*.ts',
      '<div>',
      '',
      'src/dir/',
      '//x.ts'
    ])
      expect(parseFileRef(text, root), text).toBeNull()
  })
  it('rejects escaping the window folder', () => {
    expect(parseFileRef('../outro/a.ts', root)).toBeNull()
    expect(parseFileRef('/etc/passwd', root)).toBeNull()
    expect(parseFileRef('src/../../x.ts', root)).toBeNull()
    expect(parseFileRef('src/../ok.ts', root)).toEqual({ path: '/w/p/ok.ts' })
  })
})

describe('parseFileRef as a link target', () => {
  it('accepts a name without a known extension and an absolute path outside the folder', () => {
    expect(parseFileRef('LICENSE', root)).toBeNull()
    expect(parseFileRef('LICENSE', root, { href: true })).toEqual({ path: '/w/p/LICENSE' })
    expect(parseFileRef('/etc/hosts', root, { href: true })).toEqual({ path: '/etc/hosts' })
    expect(parseFileRef('/etc/../x/a.ts:3', root, { href: true })).toEqual({ path: '/x/a.ts', line: 3 })
  })
  it('a relative path that escapes the folder is still rejected', () => {
    expect(parseFileRef('../fora.ts', root, { href: true })).toBeNull()
  })
})

describe('parseHref', () => {
  it('http, https and mailto are external', () => {
    expect(parseHref('https://example.com/a?b=1', root)).toEqual({ kind: 'external', url: 'https://example.com/a?b=1' })
    expect(parseHref('mailto:a@b.dev', root)).toEqual({ kind: 'external', url: 'mailto:a@b.dev' })
  })
  it('relative and absolute paths with line and column', () => {
    expect(parseHref('src/x.ts:10', root)).toEqual({ kind: 'file', ref: { path: '/w/p/src/x.ts', line: 10 } })
    expect(parseHref('src/x.ts:10:4', root)).toEqual({
      kind: 'file',
      ref: { path: '/w/p/src/x.ts', line: 10, column: 4 }
    })
    expect(parseHref('x.ts:10', root)).toEqual({ kind: 'file', ref: { path: '/w/p/x.ts', line: 10 } })
    expect(parseHref('./src/x.ts#L7', root)).toEqual({ kind: 'file', ref: { path: '/w/p/src/x.ts', line: 7 } })
    expect(parseHref('/other/folder/y.ts#L2-5', root)).toEqual({
      kind: 'file',
      ref: { path: '/other/folder/y.ts', line: 2 }
    })
    expect(parseHref('src/my%20file.ts', root)).toEqual({ kind: 'file', ref: { path: '/w/p/src/my file.ts' } })
  })
  it('file:// becomes a path', () => {
    expect(parseHref('file:///w/p/src/x.ts:12', root)).toEqual({
      kind: 'file',
      ref: { path: '/w/p/src/x.ts', line: 12 }
    })
    expect(parseHref('file:///w/p/a%20b.ts#L3', root)).toEqual({ kind: 'file', ref: { path: '/w/p/a b.ts', line: 3 } })
    expect(parseHref('file://servidor/x.ts', root)).toBeNull()
  })
  it('rejects an anchor, dangerous schemes and empty', () => {
    for (const href of ['#secao', 'javascript:alert(1)', 'data:text/html,x', 'vscode://file/x', '//cdn/x.js', '', '  '])
      expect(parseHref(href, root), href).toBeNull()
  })
})

describe('isLinkableHref', () => {
  it('only known paths and schemes', () => {
    for (const href of ['https://a.dev', 'mailto:a@b.c', 'src/x.ts:3', '/abs/x.ts', 'file:///x', 'C:\\x\\y.ts'])
      expect(isLinkableHref(href), href).toBe(true)
    for (const href of [
      'javascript:alert(1)',
      'data:text/html,x',
      '#a',
      '',
      'a\u0001b',
      'a\u007fb',
      'a\u0085b',
      'a\u2028b'
    ])
      expect(isLinkableHref(href), href).toBe(false)
  })
})
