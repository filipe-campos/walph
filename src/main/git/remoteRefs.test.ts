import { describe, expect, it } from 'vitest'
import { parseRemoteList, pickPublishRemote, pushArgs, splitRemoteBranch } from './remoteRefs'

describe('parseRemoteList', () => {
  it('ignores empty lines', () => {
    expect(parseRemoteList('origin\nupstream\n')).toEqual(['origin', 'upstream'])
    expect(parseRemoteList('')).toEqual([])
  })
})

describe('splitRemoteBranch', () => {
  it('splits remote and branch', () => {
    expect(splitRemoteBranch(['origin'], 'origin/feat/x')).toEqual({ remote: 'origin', branch: 'feat/x' })
  })

  it('prefers the remote with the longest name when there is `/` in the name', () => {
    expect(splitRemoteBranch(['team', 'team/fork'], 'team/fork/main')).toEqual({ remote: 'team/fork', branch: 'main' })
  })

  it('returns null without a matching remote', () => {
    expect(splitRemoteBranch(['origin'], 'other/main')).toBeNull()
    expect(splitRemoteBranch([], 'origin/main')).toBeNull()
    expect(splitRemoteBranch(['origin'], 'origin')).toBeNull()
  })
})

describe('pickPublishRemote', () => {
  it('prefers origin', () => {
    expect(pickPublishRemote(['up', 'origin'])).toBe('origin')
  })

  it('uses the only remote', () => {
    expect(pickPublishRemote(['up'])).toBe('up')
  })

  it('refuses without remotes or when ambiguous', () => {
    expect(() => pickPublishRemote([])).toThrow('Nenhum remoto configurado.')
    expect(() => pickPublishRemote(['a', 'b'])).toThrow(/vários remotos/)
  })
})

describe('pushArgs', () => {
  it('pushes explicitly to the upstream', () => {
    expect(pushArgs({ remote: 'origin', ref: 'refs/heads/main' })).toEqual(['push', 'origin', 'HEAD:refs/heads/main'])
  })

  it('refuses a local upstream', () => {
    expect(() => pushArgs({ remote: '.', ref: 'refs/heads/main' })).toThrow(/local/)
  })
})
