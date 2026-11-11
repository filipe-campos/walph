import { describe, expect, it } from 'vitest'
import { externalUrl } from './externalUrl'

describe('externalUrl', () => {
  it('accepts http, https and mailto', () => {
    expect(externalUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(externalUrl(' http://localhost:3000 ')).toBe('http://localhost:3000/')
    expect(externalUrl('mailto:a@b.dev')).toBe('mailto:a@b.dev')
    expect(externalUrl('HTTPS://EXAMPLE.COM')).toBe('https://example.com/')
  })

  it('rejects other schemes, relative URLs and junk', () => {
    for (const bad of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'vscode://x',
      'ssh://h',
      '/rel/path',
      'a.ts:10',
      '',
      42,
      null
    ]) {
      expect(externalUrl(bad)).toBeNull()
    }
  })
})
