import { describe, expect, it } from 'vitest'
import { buildChildEnv, findInPath } from './childEnv'

const FAKE = { stripPrefixes: ['WALPH_FAKE_CLAUDE'] }

describe('findInPath', () => {
  const files = new Set(['/opt/bin/claude', '/usr/bin/other'])
  const isFile = (p: string): boolean => files.has(p)
  it('finds through the PATH', () => {
    expect(findInPath('claude', '/usr/bin:/opt/bin', 'linux', isFile)).toBe('/opt/bin/claude')
    expect(findInPath('nothing', '/usr/bin', 'linux', isFile)).toBeNull()
  })
})

describe('Windows and relative PATH', () => {
  const files = new Set(['C:\\b\\claude.cmd', 'C:\\b\\claude.exe', 'C:\\c\\claude.cmd', 'rel\\claude.exe'])
  const isFile = (p: string): boolean => files.has(p)
  it('prefers .exe over .cmd and ignores relative folders', () => {
    expect(findInPath('claude', 'rel;C:\\b', 'win32', isFile, '.COM;.EXE;.BAT;.CMD')).toBe('C:\\b\\claude.exe')
    expect(findInPath('claude', '.:/rel', 'linux', (p) => p === 'rel/claude')).toBeNull()
  })
})

describe('buildChildEnv', () => {
  it('adds, deletes and removes ELECTRON_RUN_AS_NODE', () => {
    const env = buildChildEnv(
      { PATH: '/old', HOME: '/h', ELECTRON_RUN_AS_NODE: '1', DROP: 'x' },
      { DROP: null, EXTRA: 'y' },
      '/new',
      { platform: 'linux' }
    )
    expect(env).toEqual({ PATH: '/new', HOME: '/h', EXTRA: 'y' })
  })
  it('stripPrefixes removes every variable with the prefix, including one from extra, and keeps the others', () => {
    const env = buildChildEnv(
      {
        HOME: '/h',
        WALPH_FAKE_CLAUDE: '/s.json',
        WALPH_FAKE_CLAUDE_STORE: '/store',
        WALPH_FAKE_CLAUDE_LOG: '/log',
        WALPH_FAKE_DOCKER_STATE: '/d'
      },
      { WALPH_FAKE_CLAUDE_OTHER: 'x', KEEP: 'y' },
      undefined,
      { platform: 'linux', ...FAKE }
    )
    expect(env).toEqual({ HOME: '/h', WALPH_FAKE_DOCKER_STATE: '/d', KEEP: 'y' })
  })
  it('without stripPrefixes nothing but ELECTRON_RUN_AS_NODE is removed', () => {
    expect(buildChildEnv({ WALPH_FAKE_CLAUDE: '1' }, {}, undefined, { platform: 'linux' })).toEqual({
      WALPH_FAKE_CLAUDE: '1'
    })
  })
  it('Windows: stripPrefixes ignores case', () => {
    expect(
      buildChildEnv({ walph_fake_claude_log: '/log', Path: 'C:\\a' }, {}, undefined, { platform: 'win32', ...FAKE })
    ).toEqual({
      Path: 'C:\\a'
    })
  })
  it('Windows: case ignored when replacing the Path', () => {
    const env = buildChildEnv({ Path: 'C:\\old' }, {}, 'C:\\new', { platform: 'win32' })
    expect(env).toEqual({ Path: 'C:\\new' })
  })
})
