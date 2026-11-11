import { describe, expect, it } from 'vitest'
import { normalizeAccount, parseAuthStatus, readAuthStatus, runLogout } from './auth'
import { CliExitError, type ClaudeCliRunner } from './cliRunner'

const ctx = { cwd: '/p', env: {} }

describe('parseAuthStatus', () => {
  it('logged-in JSON', () => {
    expect(
      parseAuthStatus(
        JSON.stringify({
          loggedIn: true,
          authMethod: 'claude.ai',
          email: 'a@b.dev',
          orgName: 'Acme',
          subscriptionType: 'max'
        })
      )
    ).toEqual({
      loggedIn: true,
      authMethod: 'claude.ai',
      email: 'a@b.dev',
      organization: 'Acme',
      subscriptionType: 'max'
    })
  })

  it('logged-out JSON', () => {
    expect(parseAuthStatus('{"loggedIn":false,"authMethod":"none","apiProvider":"firstParty"}')).toEqual({
      loggedIn: false,
      authMethod: 'none',
      apiProvider: 'firstParty'
    })
  })

  it('text as a last resort', () => {
    expect(parseAuthStatus('Not logged in')).toEqual({ loggedIn: false })
    expect(parseAuthStatus('Logged in as me@x.dev')).toEqual({ loggedIn: true, email: 'me@x.dev' })
  })

  it('garbage throws instead of guessing', () => {
    expect(() => parseAuthStatus('???')).toThrow('estado de login')
  })

  it('caps and cleans fields', () => {
    const out = parseAuthStatus(JSON.stringify({ loggedIn: true, email: `${'a'.repeat(500)}\n` }))
    expect(out.email).toHaveLength(200)
  })
})

describe('readAuthStatus / runLogout', () => {
  it('uses `claude auth status --json`', async () => {
    const calls: string[][] = []
    const run: ClaudeCliRunner = (args) => {
      calls.push(args)
      return Promise.resolve('{"loggedIn":true}')
    }
    await expect(readAuthStatus(run, ctx)).resolves.toEqual({ loggedIn: true })
    await runLogout(run, ctx)
    expect(calls).toEqual([
      ['auth', 'status', '--json'],
      ['auth', 'logout']
    ])
  })

  it('exit code != 0 with JSON in the body still counts', async () => {
    const run: ClaudeCliRunner = () => Promise.reject(new Error('{"loggedIn":false}'))
    await expect(readAuthStatus(run, ctx)).resolves.toEqual({ loggedIn: false })
  })

  it('logged out with code 1: the stdout JSON counts even with noise on stderr', async () => {
    const run: ClaudeCliRunner = () => Promise.reject(new CliExitError('warning: noise', '{"loggedIn":false}', 1))
    await expect(readAuthStatus(run, ctx)).resolves.toEqual({ loggedIn: false })
  })

  it('"unauthenticated" text or a check error does not become logged in', () => {
    expect(parseAuthStatus('User is unauthenticated')).toEqual({ loggedIn: false })
    expect(() => parseAuthStatus('Failed to check if authenticated')).toThrow('estado de login')
  })

  it('a real failure propagates the message', async () => {
    const run: ClaudeCliRunner = () => Promise.reject(new Error('Claude Code did not respond in time.'))
    await expect(readAuthStatus(run, ctx)).rejects.toThrow('did not respond')
  })
})

describe('normalizeAccount', () => {
  it('maps the SDK AccountInfo', () => {
    expect(normalizeAccount({ email: 'a@b', tokenSource: 'claude.ai', apiProvider: 'firstParty', x: 1 })).toEqual({
      email: 'a@b',
      authMethod: 'claude.ai',
      apiProvider: 'firstParty'
    })
    expect(normalizeAccount({})).toBeNull()
    expect(normalizeAccount('x')).toBeNull()
  })
})
