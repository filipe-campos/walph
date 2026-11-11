import { describe, expect, it } from 'vitest'
import { buildTerminalEnv, resolveTerminal, type ProfileSettings } from './resolveProfile'

const settings = (over: Partial<ProfileSettings> = {}): ProfileSettings => ({
  'terminal.shell': '',
  'terminal.profiles': {
    zsh: { path: '/bin/zsh' },
    node: { path: '/usr/bin/node', args: ['-i'], env: { A: '1', B: null } }
  },
  'terminal.defaultProfile': '',
  ...over
})

describe('resolveTerminal', () => {
  it('without a profile uses terminal.shell / the OS default', () => {
    expect(resolveTerminal(null, settings(), 'linux', '/bin/fish')).toEqual({
      file: '/bin/fish',
      args: ['-l'],
      env: {},
      profile: null
    })
    expect(resolveTerminal(null, settings({ 'terminal.shell': '/bin/zsh' }), 'linux', undefined).file).toBe('/bin/zsh')
  })

  it('explicit profile: -l on a known POSIX shell, its own args and env', () => {
    expect(resolveTerminal('zsh', settings(), 'darwin', undefined)).toMatchObject({ file: '/bin/zsh', args: ['-l'] })
    expect(resolveTerminal('node', settings(), 'darwin', undefined)).toEqual({
      file: '/usr/bin/node',
      args: ['-i'],
      env: { A: '1', B: null },
      profile: 'node'
    })
  })

  it('a missing explicit profile is an error in pt-BR (including Object.prototype keys)', () => {
    expect(() => resolveTerminal('x', settings(), 'linux', undefined)).toThrow(
      'Perfil de terminal "x" não existe. Confira "terminal.profiles".'
    )
    expect(() => resolveTerminal('toString', settings(), 'linux', undefined)).toThrow('não existe')
  })

  it('an existing defaultProfile applies; a missing one falls back to terminal.shell', () => {
    expect(resolveTerminal(null, settings({ 'terminal.defaultProfile': 'node' }), 'linux', undefined).profile).toBe(
      'node'
    )
    expect(
      resolveTerminal(
        null,
        settings({ 'terminal.defaultProfile': 'nope', 'terminal.shell': '/bin/bash' }),
        'linux',
        undefined
      )
    ).toMatchObject({ file: '/bin/bash', profile: null })
  })
})

describe('buildTerminalEnv', () => {
  it('adds the profile env, null deletes, ELECTRON_RUN_AS_NODE never passes', () => {
    const env = buildTerminalEnv(
      { PATH: '/x', B: 'old', ELECTRON_RUN_AS_NODE: '1' },
      { A: '1', B: null, ELECTRON_RUN_AS_NODE: '1', TERM_PROGRAM: 'x' }
    )
    expect(env).toEqual({ PATH: '/x', A: '1', TERM_PROGRAM: 'Walph', COLORTERM: 'truecolor', CLICOLOR: '1' })
  })

  it('CLICOLOR inherited or deleted by the profile wins over the default', () => {
    expect(buildTerminalEnv({ CLICOLOR: '0' }, {}).CLICOLOR).toBe('0')
    expect(buildTerminalEnv({ CLICOLOR: '1' }, { CLICOLOR: null }).CLICOLOR).toBeUndefined()
  })

  it('on Windows case does not matter: the profile Path replaces the inherited PATH', () => {
    const env = buildTerminalEnv({ PATH: 'a', Electron_Run_As_Node: '1' }, { Path: 'b' }, 'win32')
    expect(env.Path).toBe('b')
    expect(env.PATH).toBeUndefined()
    expect(env.Electron_Run_As_Node).toBeUndefined()
    expect(buildTerminalEnv({ PATH: 'a' }, { Path: null }, 'win32').PATH).toBeUndefined()
  })

  it('outside Windows case matters', () => {
    expect(buildTerminalEnv({ PATH: 'a' }, { Path: 'b' }, 'linux')).toMatchObject({ PATH: 'a', Path: 'b' })
  })
})
