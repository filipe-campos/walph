import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { downloadedNotice, downloadingNotice, errorNotice, sameOptions, updaterOptions } from './notices'

describe('updaterOptions', () => {
  it('stable uses latest without prereleases', () => {
    expect(updaterOptions(DEFAULT_SETTINGS)).toEqual({ enabled: true, channel: 'latest', allowPrerelease: false })
  })
  it('beta accepts prereleases', () => {
    const o = updaterOptions({ 'update.enabled': false, 'update.channel': 'beta' })
    expect(o).toEqual({ enabled: false, channel: 'beta', allowPrerelease: true })
  })
  it('sameOptions compares the three fields', () => {
    const a = updaterOptions(DEFAULT_SETTINGS)
    expect(sameOptions(a, { ...a })).toBe(true)
    expect(sameOptions(a, { ...a, channel: 'beta' })).toBe(false)
    expect(sameOptions(null, a)).toBe(false)
  })
})

describe('notices', () => {
  it('carry the version', () => {
    expect(downloadingNotice('1.2.3')).toMatchObject({ kind: 'downloading', version: '1.2.3' })
    expect(downloadedNotice('1.2.3').message).toContain('1.2.3')
  })
  it('404 and unknown errors become generic text without leaking the original', () => {
    const n = errorNotice(
      new Error('Cannot find latest.yml in the latest release artifacts (https://x): HttpError: 404\n at ...')
    )
    expect(n).toEqual({ kind: 'error', message: 'Não foi possível verificar atualizações.' })
  })
  it('network', () => {
    const err = Object.assign(new Error('getaddrinfo'), { code: 'ENOTFOUND' })
    expect(errorNotice(err).message).toContain('sem conexão')
  })
  it('signature', () => {
    expect(errorNotice(new Error('Could not get code signature for running application')).message).toContain('assinado')
  })
})
