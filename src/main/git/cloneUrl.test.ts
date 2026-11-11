import { describe, expect, it } from 'vitest'
import { checkCloneUrl, folderNameFromPath, resolveCloneUrl } from './cloneUrl'

const ok = (url: string, name: string, allowFile = false): void => {
  expect(checkCloneUrl(url, { allowFile })).toEqual({ ok: true, name })
}
const bad = (url: string, part?: string, allowFile = false): void => {
  const r = checkCloneUrl(url, { allowFile })
  expect(r.ok, url).toBe(false)
  if (!r.ok) {
    expect(r.error).toMatch(/^URL de clone inválida: /)
    if (part) expect(r.error).toContain(part)
  }
}

describe('checkCloneUrl: accepted', () => {
  it('https with and without .git, trailing slash and credentials', () => {
    ok('https://github.com/filipe/walph.git', 'walph')
    ok('https://github.com/filipe/walph', 'walph')
    ok('https://github.com/filipe/walph/', 'walph')
    ok('https://github.com/filipe/walph.git/', 'walph')
    ok('https://user:tok@bitbucket.org/ws/repo.git', 'repo')
    ok('  https://github.com/a/b.git  ', 'b')
  })

  it('ssh:// and scp-like', () => {
    ok('ssh://git@github.com/filipe/walph.git', 'walph')
    ok('ssh://git@host:2222/srv/git/project.git', 'project')
    ok('git@github.com:filipe/walph.git', 'walph')
    ok('deploy@meu-host.local:repo', 'repo')
  })

  it('file:// only with allowFile', () => {
    ok('file:///tmp/source/repo.git', 'repo', true)
    bad('file:///tmp/source/repo.git', 'file://')
  })
})

describe('checkCloneUrl: refused', () => {
  it('empty and with spaces/control characters', () => {
    bad('')
    bad('   ')
    bad('https://a.com/x y.git', 'espaços')
    bad('https://a.com/x\n.git')
    bad('https://a.com/\u0000x')
  })

  it('starting with "-"', () => {
    bad('--upload-pack=touch /tmp/x', 'começam com "-"')
    bad('-oProxyCommand=evil', 'começam com "-"')
    bad('  -x')
  })

  it('ext:: and similar transports', () => {
    bad('ext::sh -c touch% /tmp/x', 'Transporte "ext::" não é permitido.')
    bad('ext::sh', 'ext::')
    bad('fd::17/foo', 'fd::')
    bad('EXT::foo', 'EXT::')
    bad('git+ssh::x')
  })

  it('protocols outside the list', () => {
    bad('http://github.com/a/b.git', 'http://')
    bad('git://github.com/a/b.git', 'git://')
    bad('ftp://x/y')
    bad('javascript://x/y')
  })

  it('local paths', () => {
    bad('/home/user/repo', 'locais')
    bad('./repo')
    bad('../repo')
    bad('~/repo')
    bad('C:\\repos\\x', 'locais')
    bad('C:/repos/x')
    bad('\\\\server\\share\\x')
    bad('repo')
  })

  it('a host or user that ssh would read as an option', () => {
    bad('ssh://-oProxyCommand=touch%20/tmp/x/repo')
    bad('ssh://-oProxyCommand=x@host/repo')
    bad('git@-oProxyCommand=x:repo')
    bad('-o@host:repo')
    bad('https://')
    bad('ssh:///repo')
  })

  it('without a derivable folder name', () => {
    bad('https://github.com/', 'nome da pasta')
    bad('https://github.com/a/..', 'nome da pasta')
    bad('https://github.com/a/%2e%2e', 'nome da pasta')
    bad('https://github.com/a/.git', 'nome da pasta')
    bad('git@host:', 'host')
    bad('git@host:a/..')
  })

  it('not a string', () => {
    bad(undefined as unknown as string)
  })
})

describe('checkCloneUrl: extra cases', () => {
  it('accepts an uppercase scheme, a port, an absolute scp path and names with a dot', () => {
    ok('HTTPS://github.com/a/b.git', 'b')
    ok('https://git.example.com:8443/group/sub/project.git', 'project')
    ok('git@github.com:/srv/git/repo.git', 'repo')
    ok('https://github.com/a/my.project.git', 'my.project')
    ok('https://github.com/a/b%20c.git', 'b c')
  })

  it('with allowFile, file:// still goes through the other rules', () => {
    bad('-file:///tmp/x', 'começam com "-"', true)
    bad('ext::file:///tmp/x', 'ext::', true)
    bad('file:///', 'nome da pasta', true)
  })

  it('refuses ssh/https with a user starting with "-" and scp with // after the colon', () => {
    bad('https://-oProxyCommand=x@host/repo')
    bad('git@github.com://a/b.git')
    bad('ssh://%2DoProxyCommand=x@host/repo')
  })

  it('refuses a URL that is too long and schemes that run or read things', () => {
    bad('https://a.com/' + 'x'.repeat(2100), 'longa demais')
    bad('data://x/y')
    bad('git+ssh://git@host/a/b.git')
  })

  it('refuses folder names invalid on Windows', () => {
    bad('https://github.com/a/b%3Ac.git', 'nome da pasta')
    bad('https://github.com/a/b%7Cc.git', 'nome da pasta')
    bad('https://github.com/a/b%20.git', 'nome da pasta')
  })
})

describe('folderNameFromPath', () => {
  it('derives and refuses dangerous names', () => {
    expect(folderNameFromPath('/a/b/c.git')).toBe('c')
    expect(folderNameFromPath('/a/b%20c')).toBe('b c')
    expect(folderNameFromPath('/a/%2fb')).toBeNull()
    expect(folderNameFromPath('/a/b%5Cc')).toBeNull()
    expect(folderNameFromPath('/')).toBeNull()
    expect(folderNameFromPath('/a/x.')).toBeNull()
    expect(folderNameFromPath('/a/' + 'x'.repeat(300))).toBeNull()
  })
})

describe('resolveCloneUrl: normalization', () => {
  it('lowercase scheme (GIT_ALLOW_PROTOCOL is case-sensitive), rest intact', () => {
    expect(resolveCloneUrl('HTTPS://GitHub.com/Foo/Bar.git')).toEqual({
      ok: true,
      name: 'Bar',
      url: 'https://GitHub.com/Foo/Bar.git'
    })
    expect(resolveCloneUrl('  SSH://git@host/a/b.git ')).toMatchObject({ ok: true, url: 'ssh://git@host/a/b.git' })
    expect(resolveCloneUrl('git@github.com:a/b.git')).toMatchObject({ ok: true, url: 'git@github.com:a/b.git' })
  })
})
