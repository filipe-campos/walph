import { describe, expect, it } from 'vitest'
import { buildFilenamesPlist, parseFilenamesPlist, parseFileUrlList } from './clipboardFiles'

describe('parseFilenamesPlist', () => {
  it('reads several paths and unescapes XML entities', () => {
    const xml = buildFilenamesPlist(['/a/b & c.txt', '/a/<d>'])
    expect(parseFilenamesPlist(xml)).toEqual(['/a/b & c.txt', '/a/<d>'])
  })

  it('drops relative, empty and garbage', () => {
    expect(parseFilenamesPlist('<array><string>rel</string><string></string><string>/ok</string></array>')).toEqual([
      '/ok'
    ])
    expect(parseFilenamesPlist('anything')).toEqual([])
  })
})

describe('parseFileUrlList', () => {
  it('posix: converts file:// and ignores comments and other schemes', () => {
    const text = '# comment\nfile:///tmp/a%20b.txt\r\nhttps://x.dev/y\nfile:///tmp/c'
    expect(parseFileUrlList(text, 'linux')).toEqual(['/tmp/a b.txt', '/tmp/c'])
    expect(parseFileUrlList('file:///C:/x', 'darwin')).toEqual(['/C:/x'])
  })

  it('win32: drive, UNC and a URL without a drive dropped', () => {
    const text = '# comment\nfile:///C:/Users/a%20b.txt\r\nhttps://x.dev/y\nfile://srv/share/x\nfile:///tmp/c'
    expect(parseFileUrlList(text, 'win32')).toEqual(['C:\\Users\\a b.txt', '\\\\srv\\share\\x'])
  })
})

describe('parseFilenamesPlist per platform', () => {
  const xml = '<array><string>C:\\a\\b</string><string>/posix</string></array>'

  it('accepts only absolute paths of the platform', () => {
    expect(parseFilenamesPlist(xml, 'win32')).toEqual(['C:\\a\\b', '/posix'])
    expect(parseFilenamesPlist(xml, 'linux')).toEqual(['/posix'])
  })
})
