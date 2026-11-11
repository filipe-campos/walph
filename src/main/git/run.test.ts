import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeWebContents } from '../testing/fakeIpc'
import { git, makeTempRepo, useGitTestEnv } from '../testing/gitRepo'
import { gitStatusCode, hasOwnedGit, networkEnv, runGit } from './run'

vi.mock('electron', () => ({}))

const posix = process.platform !== 'win32'

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function until(cond: () => boolean, ms = 8000): Promise<boolean> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (cond()) return true
    await new Promise((r) => setTimeout(r, 40))
  }
  return cond()
}

describe.skipIf(!posix)('local git with hooks and deadline', () => {
  let repo: string
  let pidFile: string
  let restoreEnv: () => void = () => undefined

  beforeAll(() => {
    restoreEnv = useGitTestEnv()
    repo = makeTempRepo({ 'a.txt': 'a\n' }, { commit: false })
    pidFile = join(repo, 'hook.pid')
    git(repo, 'add', '-A')
    mkdirSync(join(repo, '.git', 'hooks'), { recursive: true })
    const hook = join(repo, '.git', 'hooks', 'pre-commit')
    writeFileSync(hook, `#!/bin/sh\necho $$ > "${pidFile}"\nsleep 300 &\nwait\n`)
    chmodSync(hook, 0o755)
  })

  afterAll(() => {
    restoreEnv()
    rmSync(repo, { recursive: true, force: true })
  })

  it('a stuck hook exceeds the deadline, returns the translated message and kills the tree', async () => {
    const wc = fakeWebContents()
    const result = runGit(repo, ['commit', '-m', 'x'], { localOwner: wc as never, timeoutMs: 600 }).then(
      () => 'ok',
      (err: Error) => err
    )
    expect(await until(() => existsSync(pidFile))).toBe(true)
    const hookPid = Number(readFileSync(pidFile, 'utf8').trim())
    expect(hasOwnedGit(wc as never)).toBe(true)

    expect(await result).toMatchObject({ message: expect.stringMatching(/demorou demais para responder/) })
    expect(await until(() => !isAlive(hookPid))).toBe(true)
    expect(hasOwnedGit(wc as never)).toBe(false)
  }, 20_000)

  it('reloading the view cancels the commit and kills the hook', async () => {
    rmSync(pidFile, { force: true })
    const wc = fakeWebContents()
    const result = runGit(repo, ['commit', '-m', 'x'], { localOwner: wc as never }).then(
      () => 'ok',
      (err: Error) => err
    )
    expect(await until(() => existsSync(pidFile))).toBe(true)
    const hookPid = Number(readFileSync(pidFile, 'utf8').trim())

    wc.emit('did-navigate')

    expect(await result).toMatchObject({ message: 'A operação do Git foi cancelada.', aborted: true })
    expect(await until(() => !isAlive(hookPid))).toBe(true)
  }, 20_000)

  it('cancelling a commit in progress does not leave an orphan .git/index.lock', async () => {
    rmSync(pidFile, { force: true })
    const lock = join(repo, '.git', 'index.lock')
    const wc = fakeWebContents()
    const result = runGit(repo, ['commit', '-a', '-m', 'x'], { localOwner: wc as never }).catch((err: Error) => err)
    expect(await until(() => existsSync(pidFile))).toBe(true)
    expect(existsSync(lock)).toBe(true)

    wc.emit('did-navigate')
    await result

    expect(await until(() => !existsSync(lock))).toBe(true)
  }, 20_000)

  it('plumbing without an owner also has a deadline', async () => {
    const started = Date.now()
    await expect(runGit(repo, ['-c', 'alias.hang=!sleep 30', 'hang'], { timeoutMs: 400 })).rejects.toThrow(
      /demorou demais para responder/
    )
    expect(Date.now() - started).toBeLessThan(10_000)
  })
})

describe('gitStatusCode', () => {
  let repo: string
  let restoreEnv: () => void = () => undefined

  beforeAll(() => {
    restoreEnv = useGitTestEnv()
    repo = makeTempRepo({ 'a.txt': 'a\n' })
  })

  afterAll(() => {
    restoreEnv()
    rmSync(repo, { recursive: true, force: true })
  })

  it('0 when the command ends well, with the stdout', async () => {
    const r = await gitStatusCode(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])
    expect(r).toEqual({ code: 0, stdout: 'main\n' })
  })

  it("returns git's exit code instead of rejecting", async () => {
    expect((await gitStatusCode(repo, ['check-ignore', '-q', '--', 'a.txt'])).code).toBe(1)
    expect((await gitStatusCode(repo, ['rev-parse', '--verify', 'does-not-exist'])).code).toBe(128)
  })

  it('-1 when the process does not get to run (missing folder)', async () => {
    expect((await gitStatusCode(join(repo, 'does-not-exist'), ['status'])).code).toBe(-1)
  })
})

describe('environment of the git processes', () => {
  let repo: string
  let restoreEnv: () => void = () => undefined

  beforeAll(() => {
    restoreEnv = useGitTestEnv()
    repo = makeTempRepo({ 'a.txt': 'a\n' })
  })

  afterAll(() => {
    restoreEnv()
    rmSync(repo, { recursive: true, force: true })
  })

  const childEnv = async (): Promise<Map<string, string>> => {
    const out = (await runGit(repo, ['-c', 'alias.dumpenv=!env', 'dumpenv'])).stdout.toString()
    return new Map(
      out
        .split(/\r?\n/)
        .flatMap((l) => (l.includes('=') ? [[l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)] as const] : []))
    )
  }

  it.skipIf(!posix)('pins the prompt off, optional locks off and messages in English', async () => {
    vi.stubEnv('GIT_TERMINAL_PROMPT', '1')
    vi.stubEnv('GIT_OPTIONAL_LOCKS', '1')
    vi.stubEnv('LC_MESSAGES', 'pt_BR.UTF-8')
    vi.stubEnv('LANGUAGE', 'pt_BR')
    const env = await childEnv()
    expect(env.get('GIT_TERMINAL_PROMPT')).toBe('0')
    expect(env.get('GIT_OPTIONAL_LOCKS')).toBe('0')
    expect(env.get('LC_MESSAGES')).toBe('C')
    expect(env.get('LANGUAGE')).toBe('C')
  })

  it.skipIf(!posix)('LC_ALL is only switched to C when it was already defined', async () => {
    vi.stubEnv('LC_ALL', 'pt_BR.UTF-8')
    expect((await childEnv()).get('LC_ALL')).toBe('C')
    vi.stubEnv('LC_ALL', undefined)
    expect((await childEnv()).has('LC_ALL')).toBe(false)
  })

  it.skipIf(!posix)('does not pass on ELECTRON_RUN_AS_NODE inherited from VS Code/Claude Code', async () => {
    vi.stubEnv('ELECTRON_RUN_AS_NODE', '1')
    expect((await childEnv()).has('ELECTRON_RUN_AS_NODE')).toBe(false)
  })

  it.skipIf(!posix)('gitStatusCode uses the same environment (no credential prompt)', async () => {
    vi.stubEnv('GIT_TERMINAL_PROMPT', '1')
    const r = await gitStatusCode(repo, ['-c', 'alias.dumpenv=!env', 'dumpenv'])
    expect(r.stdout).toContain('GIT_TERMINAL_PROMPT=0')
  })

  describe('networkEnv', () => {
    beforeEach(() => {
      vi.stubEnv('GIT_SSH_COMMAND', undefined)
      vi.stubEnv('GIT_SSH', undefined)
    })

    it('forces non-interactive SSH and keeps the base environment', async () => {
      const env = await networkEnv(repo)
      expect(env.GIT_SSH_COMMAND).toBe('ssh -o BatchMode=yes')
      expect(env.GIT_TERMINAL_PROMPT).toBe('0')
      expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    })

    it("respects the user's GIT_SSH_COMMAND and GIT_SSH", async () => {
      vi.stubEnv('GIT_SSH_COMMAND', 'meu-ssh -v')
      expect((await networkEnv(repo)).GIT_SSH_COMMAND).toBe('meu-ssh -v')
      vi.stubEnv('GIT_SSH_COMMAND', undefined)
      vi.stubEnv('GIT_SSH', '/usr/bin/meu-ssh')
      expect((await networkEnv(repo)).GIT_SSH_COMMAND).toBeUndefined()
    })

    it("respects the repository's core.sshCommand, but the clone (globalOnly) ignores it", async () => {
      git(repo, 'config', 'core.sshCommand', 'ssh -i key')
      try {
        expect((await networkEnv(repo)).GIT_SSH_COMMAND).toBeUndefined()
        expect((await networkEnv(repo, true)).GIT_SSH_COMMAND).toBe('ssh -o BatchMode=yes')
      } finally {
        git(repo, 'config', '--unset', 'core.sshCommand')
      }
    })
  })
})
