import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveLinkTarget, type LinkFs } from './linkTarget'

const fakeFs = (real: Record<string, string>, links: Record<string, string> = {}): LinkFs => ({
  realpath: async (p) => {
    if (p in real) return real[p]
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
  },
  readlink: async (p) => {
    if (p in links) return links[p]
    throw Object.assign(new Error('EINVAL'), { code: 'EINVAL' })
  }
})

describe('resolveLinkTarget (fake fs)', () => {
  // `resolveLinkTarget` uses `path.resolve`: on Windows '/u' becomes 'C:\\u', so keys and expectations go through
  // `resolve`.
  const r = resolve

  it('regular file: null', async () => {
    const fs = fakeFs({ [r('/u/settings.json')]: r('/u/settings.json'), [r('/u')]: r('/u') })
    expect(await resolveLinkTarget('/u/settings.json', fs)).toBeNull()
  })

  it('symlink: returns the real file', async () => {
    const fs = fakeFs({ [r('/u/settings.json')]: r('/dot/settings.json'), [r('/u')]: r('/u') })
    expect(await resolveLinkTarget('/u/settings.json', fs)).toBe(r('/dot/settings.json'))
  })

  it('a symlinked folder above does not count', async () => {
    const fs = fakeFs({
      [r('/tmp/u/settings.json')]: r('/private/tmp/u/settings.json'),
      [r('/tmp/u')]: r('/private/tmp/u')
    })
    expect(await resolveLinkTarget('/tmp/u/settings.json', fs)).toBeNull()
  })

  it('broken link: uses readlink (relative to the link folder)', async () => {
    const fs = fakeFs({}, { [r('/u/settings.json')]: join('..', 'dot', 'settings.json') })
    expect(await resolveLinkTarget('/u/settings.json', fs)).toBe(r('/dot/settings.json'))
  })

  it('missing file: null', async () => {
    expect(await resolveLinkTarget('/u/settings.json', fakeFs({}))).toBeNull()
  })
})

describe('resolveLinkTarget (disk)', () => {
  let dir = ''
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  // Symlinks on Windows require developer mode/admin, which the CI runner does not guarantee.
  it.skipIf(process.platform === 'win32')('follows a real symlink and ignores a regular file', async () => {
    dir = await mkdtemp(join(tmpdir(), 'walph-link-'))
    await mkdir(join(dir, 'user'))
    await mkdir(join(dir, 'dotfiles'))
    await writeFile(join(dir, 'dotfiles', 'settings.json'), '{}')
    await writeFile(join(dir, 'user', 'keybindings.json'), '[]')
    await symlink(join(dir, 'dotfiles', 'settings.json'), join(dir, 'user', 'settings.json'))
    const target = await resolveLinkTarget(join(dir, 'user', 'settings.json'))
    expect(target?.endsWith(join('dotfiles', 'settings.json'))).toBe(true)
    expect(await resolveLinkTarget(join(dir, 'user', 'keybindings.json'))).toBeNull()
  })
})
