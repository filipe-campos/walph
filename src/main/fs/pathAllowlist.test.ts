import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PathAllowlist } from './pathAllowlist'

let base: string
beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'walph-allow-')))
})
afterEach(() => rm(base, { recursive: true, force: true }))

describe('PathAllowlist with deadline and pinned file', () => {
  it('verify: unknown, ok (renews the deadline), expired and cleared', async () => {
    const file = join(base, 'a.txt')
    await writeFile(file, 'a')
    let now = 1000
    const list = new PathAllowlist({ ttlMs: 100, pinFile: true, now: () => now })
    expect(await list.verify(file)).toBe('unknown')
    await list.allow(file)
    now = 1090
    expect(await list.verify(file)).toBe('ok')
    // renewed from 1090: 1180 is still valid, 1191 is not
    now = 1180
    expect(await list.verify(file)).toBe('ok')
    now = 1281
    expect(await list.verify(file)).toBe('expired')
    expect(await list.verify(file)).toBe('unknown')
    await list.allow(file)
    list.clear()
    expect(await list.verify(file)).toBe('unknown')
  })

  // symlink needs developer/admin mode on Windows
  it.skipIf(process.platform === 'win32')(
    'a file swapped after the grant (symlink or replacement) is "changed"',
    async () => {
      const file = join(base, 'link.txt')
      const a = join(base, 'a.txt')
      const b = join(base, 'b.txt')
      await writeFile(a, 'a')
      await writeFile(b, 'b')
      await symlink(a, file)
      const list = new PathAllowlist({ pinFile: true })
      await list.allow(file)
      expect(await list.verify(file)).toBe('ok')
      await rm(file)
      await symlink(b, file)
      expect(await list.verify(file)).toBe('changed')
      await rm(file)
      expect(await list.verify(file)).toBe('changed')
    }
  )

  it('does not grant a file that does not exist', async () => {
    await expect(new PathAllowlist({ pinFile: true }).allow(join(base, 'nothing'))).rejects.toThrow()
  })
})

describe('PathAllowlist by path', () => {
  it('grants a path that does not exist yet and accepts it after it is created', async () => {
    const list = new PathAllowlist()
    const file = join(base, 'new', 'x.txt')
    await list.allow(file)
    expect(await list.verify(file)).toBe('ok')
    await mkdir(join(base, 'new'))
    await writeFile(file, 'x')
    expect(await list.verify(file)).toBe('ok')
  })

  it('the rewritten file (new inode) stays granted', async () => {
    const list = new PathAllowlist()
    const file = join(base, 'a.txt')
    await writeFile(file, 'a')
    await list.allow(file)
    await rm(file)
    await writeFile(file, 'b')
    expect(await list.verify(file)).toBe('ok')
  })

  it('does not expire without a deadline', async () => {
    let now = 0
    const list = new PathAllowlist({ now: () => now })
    const file = join(base, 'a.txt')
    await list.allow(file)
    now = Number.MAX_SAFE_INTEGER
    expect(await list.verify(file)).toBe('ok')
  })

  it('another path stays unknown (a similar segment does not count)', async () => {
    const list = new PathAllowlist()
    await list.allow(join(base, 'a.txt'))
    expect(await list.verify(join(base, 'a.txt2'))).toBe('unknown')
    expect(await list.verify(join(base, 'sub', 'a.txt'))).toBe('unknown')
  })

  it.skipIf(process.platform === 'win32')('a symlink that starts pointing to another target is "changed"', async () => {
    const list = new PathAllowlist()
    const a = join(base, 'a.txt')
    const link = join(base, 'link.txt')
    await writeFile(a, 'a')
    await symlink(a, link)
    await list.allow(link)
    await rm(link)
    await symlink(join(base, 'other.txt'), link)
    expect(await list.verify(link)).toBe('changed')
  })

  it('compares case like the system (macOS and Windows ignore it)', async () => {
    const list = new PathAllowlist()
    const file = join(base, 'Readme.txt')
    await writeFile(file, 'x')
    await list.allow(file)
    const insensitive = process.platform === 'darwin' || process.platform === 'win32'
    expect(await list.verify(join(base, 'readme.txt'))).toBe(insensitive ? 'ok' : 'unknown')
  })

  it('verify ok renews the position: eviction takes the most idle grant', async () => {
    const list = new PathAllowlist({ maxEntries: 2 })
    await list.allow(join(base, 'a'))
    await list.allow(join(base, 'b'))
    expect(await list.verify(join(base, 'a'))).toBe('ok')
    await list.allow(join(base, 'c'))
    expect(await list.verify(join(base, 'a'))).toBe('ok')
    expect(await list.verify(join(base, 'b'))).toBe('unknown')
  })

  it('an obsolete grant (isStale) records nothing', async () => {
    const list = new PathAllowlist()
    await list.allow(join(base, 'a'), () => true)
    expect(await list.verify(join(base, 'a'))).toBe('unknown')
  })

  it('maxEntries evicts the oldest grant', async () => {
    const list = new PathAllowlist({ maxEntries: 2 })
    await list.allow(join(base, 'a'))
    await list.allow(join(base, 'b'))
    await list.allow(join(base, 'c'))
    expect(await list.verify(join(base, 'a'))).toBe('unknown')
    expect(await list.verify(join(base, 'b'))).toBe('ok')
    expect(await list.verify(join(base, 'c'))).toBe('ok')
  })
})
