import { describe, expect, it } from 'vitest'
import { classifyGitError, isPathNotInRef } from './gitErrors'

const AUTH_MESSAGE =
  'Falha de autenticação no remoto. Configure as credenciais pelo terminal integrado (ex.: rode `git push` lá) e tente de novo.'

describe('classifyGitError', () => {
  it.each([
    "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
    'remote: Invalid username or password.\nfatal: Authentication failed for ...',
    'git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.',
    'Host key verification failed.\nfatal: Could not read from remote repository.',
    "fatal: unable to access 'https://x/': The requested URL returned error: 403"
  ])('authentication: %s', (raw) => {
    expect(classifyGitError(raw)).toBe(AUTH_MESSAGE)
  })

  it('no upstream', () => {
    expect(classifyGitError('fatal: The current branch x has no upstream branch.')).toMatch(/upstream/)
    expect(classifyGitError('There is no tracking information for the current branch.')).toMatch(/upstream/)
  })

  it('rejected push and pull that does not fast-forward', () => {
    expect(classifyGitError(' ! [rejected] main -> main (non-fast-forward)\nerror: failed to push some refs')).toMatch(
      /push rejeitado/
    )
    expect(classifyGitError('fatal: Not possible to fast-forward, aborting.')).toMatch(/divergiram/)
  })

  it('local changes would be overwritten', () => {
    const raw = 'error: Your local changes to the following files would be overwritten by checkout:\n\ta.ts'
    expect(classifyGitError(raw)).toMatch(/sobrescritas/)
    expect(classifyGitError('error: Your local changes to the following files would be overwritten by merge')).toMatch(
      /sobrescritas/
    )
  })

  it('stash without changes, missing and in conflict', () => {
    expect(classifyGitError('No local changes to save')).toMatch(/Não há alterações/)
    expect(classifyGitError('No stash entries found.')).toMatch(/Stash não encontrado/)
    expect(classifyGitError('CONFLICT (content): Merge conflict in a.ts', 'stashPop')).toMatch(/mantido na pilha/)
    expect(classifyGitError('CONFLICT (content): Merge conflict in a.ts', 'stashApply')).toMatch(/Conflitos/)
  })

  it('network unavailable', () => {
    expect(classifyGitError("fatal: unable to access 'https://x/': Could not resolve host: x")).toMatch(/conectar/)
  })

  it('existing branch and other cases', () => {
    expect(classifyGitError("fatal: a branch named 'x' already exists")).toMatch(/Já existe/)
    expect(classifyGitError('Author identity unknown')).toMatch(/user\.name/)
  })

  it('unknown text passes as it came', () => {
    expect(classifyGitError('  fatal: algo estranho\n')).toBe('fatal: algo estranho')
  })
})

describe('classifyGitError: extra cases', () => {
  it('authentication takes priority over network when both show up', () => {
    const raw = 'Permission denied (publickey).\nfatal: Could not read from remote repository.'
    expect(classifyGitError(raw)).toBe(AUTH_MESSAGE)
  })

  it('repository without commits', () => {
    expect(classifyGitError('fatal: You do not have the initial commit yet')).toMatch(/nenhum commit/)
  })

  it('untracked files would be overwritten', () => {
    const raw = 'error: The following untracked working tree files would be overwritten by checkout:\n\tx.txt'
    expect(classifyGitError(raw)).toMatch(/sobrescritas/)
  })

  it('index.lock and another git process', () => {
    expect(classifyGitError("fatal: Unable to create '/r/.git/index.lock': File exists.")).toMatch(/index\.lock/)
  })

  it('nothing to commit and invalid branch name', () => {
    expect(classifyGitError('nothing to commit, working tree clean')).toMatch(/nada para commitar/)
    expect(classifyGitError("fatal: 'a..b' is not a valid branch name")).toMatch(/inválido/)
  })

  it('missing remote and nothing to push', () => {
    expect(classifyGitError("fatal: 'foo' does not appear to be a git repository")).toMatch(/Remoto inválido/)
    expect(classifyGitError('error: src refspec main does not match any')).toMatch(/commit primeiro/)
  })

  it('a conflict without stash context keeps the original text', () => {
    const raw = 'CONFLICT (content): Merge conflict in a.ts'
    expect(classifyGitError(raw)).toBe(raw)
  })

  it('ignores case differences', () => {
    expect(classifyGitError('NO STASH ENTRIES FOUND.')).toMatch(/Stash não encontrado/)
  })

  it('empty text returns empty', () => {
    expect(classifyGitError('')).toBe('')
    expect(classifyGitError('   \n')).toBe('')
  })
})

describe('classifyGitError (clone)', () => {
  const clone = (raw: string): string => classifyGitError(raw, 'clone')

  it('missing or private repository', () => {
    expect(clone('ERROR: Repository not found.\nfatal: Could not read from remote repository.')).toMatch(
      /^Repositório não encontrado/
    )
    expect(clone("fatal: repository 'https://x.com/a/b.git/' not found")).toMatch(/^Repositório não encontrado/)
    expect(clone("fatal: unable to access 'https://x.com/a/b.git/': The requested URL returned error: 404")).toMatch(
      /^Repositório não encontrado/
    )
  })

  it('authentication', () => {
    expect(clone("fatal: could not read Username for 'https://github.com': terminal prompts disabled")).toBe(
      AUTH_MESSAGE
    )
    expect(clone('git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.')).toBe(
      AUTH_MESSAGE
    )
  })

  it('network', () => {
    expect(clone("fatal: unable to access 'https://x.com/': Could not resolve host: x.com")).toMatch(/conectar/)
  })

  it('existing destination', () => {
    expect(clone("fatal: destination path 'x' already exists and is not an empty directory.")).toMatch(/já existe/)
  })

  it('generic: last useful line, without progress or "fatal:"', () => {
    expect(clone("Cloning into 'x'...\nReceiving objects:  45% (4/9)\r\nfatal: early EOF\n")).toBe(
      'Não foi possível clonar o repositório: early EOF'
    )
    expect(clone('')).toBe('Não foi possível clonar o repositório.')
  })
})

describe('isPathNotInRef', () => {
  it.each([
    "fatal: path 'a.txt' exists on disk, but not in 'HEAD'",
    "fatal: path 'a.txt' exists on disk, but not in the index",
    "fatal: path 'a.txt' does not exist in 'HEAD'",
    "fatal: path 'a.txt' does not exist (neither on disk nor in the index)",
    "fatal: path 'a.txt' is in the index, but not at stage 0",
    "fatal: invalid object name 'HEAD'."
  ])('missing path: %s', (raw) => {
    expect(isPathNotInRef(raw)).toBe(true)
  })

  it.each([
    'fatal: unable to read 1234abcd',
    'fatal: bad object HEAD',
    'fatal: not a git repository',
    'O Git demorou demais'
  ])('another failure: %s', (raw) => {
    expect(isPathNotInRef(raw)).toBe(false)
  })
})
