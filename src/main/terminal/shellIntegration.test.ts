import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeRealTempDir } from '../testing/testEnv'
import { shellIntegrationFiles, withShellIntegration } from './shellIntegration'

describe('withShellIntegration', () => {
  it('zsh: points ZDOTDIR to the scripts and keeps the user one', () => {
    const out = withShellIntegration({ file: '/bin/zsh', args: ['-l'], env: { ZDOTDIR: '/u' } }, 'darwin', '/si')
    expect(out.args).toEqual(['-l'])
    expect(out.env).toMatchObject({
      ZDOTDIR: join('/si', 'zsh'),
      WALPH_ZDOTDIR: join('/si', 'zsh'),
      WALPH_USER_ZDOTDIR: '/u'
    })
  })

  it('bash: swaps -l for the init-file and signals it was a login shell', () => {
    const login = withShellIntegration({ file: '/bin/bash', args: ['-l'], env: {} }, 'linux', '/si')
    expect(login.args).toEqual(['--init-file', join('/si', 'bash', 'init.bash')])
    expect(login.env.WALPH_BASH_LOGIN).toBe('1')
    expect(withShellIntegration({ file: 'bash', args: [], env: {} }, 'linux', '/si').env.WALPH_BASH_LOGIN).toBe('')
  })

  it('does not touch other shells, custom arguments or Windows', () => {
    const cases = [
      { file: '/usr/bin/fish', args: ['-l'], env: {} },
      { file: '/bin/zsh', args: ['-c', 'ls'], env: {} },
      { file: '/bin/bash', args: ['--norc'], env: {} }
    ]
    for (const launch of cases) expect(withShellIntegration(launch, 'linux', '/si')).toBe(launch)
    const win = { file: 'bash', args: [], env: {} }
    expect(withShellIntegration(win, 'win32', '/si')).toBe(win)
  })
})

const hasShell = (path: string): boolean => process.platform !== 'win32' && existsSync(path)

describe.runIf(hasShell('/bin/zsh') || hasShell('/bin/bash'))('scripts in a real shell', () => {
  let root: string
  let home: string
  let dir: string

  beforeAll(() => {
    root = makeRealTempDir('walph-si-')
    home = join(root, 'home')
    dir = join(root, 'si')
    mkdirSync(home)
    for (const [rel, content] of Object.entries(shellIntegrationFiles())) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true })
      writeFileSync(join(dir, rel), content)
    }
  })

  afterAll(() => rmSync(root, { recursive: true, force: true }))

  const run = (launch: { file: string; args: string[]; env: Record<string, string> }, command: string): string => {
    const env = { HOME: home, PATH: '/usr/bin:/bin', TERM: 'xterm', ...launch.env }
    const plan = withShellIntegration({ ...launch, env }, process.platform, dir)
    return execFileSync(plan.file, [...plan.args, '-i', '-c', command], { env: plan.env, encoding: 'utf8' }).trim()
  }

  it.runIf(hasShell('/bin/zsh'))('zsh: colors the default prompt, keeps a custom one and restores ZDOTDIR', () => {
    const show = 'print -r -- "$PROMPT|${ZDOTDIR-unset}|$HISTFILE|${WALPH_ZDOTDIR-unset}"'
    rmSync(join(home, '.zshrc'), { force: true })
    const [prompt, zdotdir, histfile, walph] = run({ file: '/bin/zsh', args: ['-l'], env: {} }, show).split('|')
    expect(prompt).toContain('❯')
    expect(zdotdir).toBe('unset')
    expect(walph).toBe('unset')
    if (histfile) expect(histfile).toBe(join(home, '.zsh_history'))

    writeFileSync(join(home, '.zshrc'), "PROMPT='custom>'\n")
    expect(run({ file: '/bin/zsh', args: [], env: {} }, show).split('|')[0]).toBe('custom>')
  })

  it.runIf(hasShell('/bin/bash'))('bash: colors the default prompt and keeps a custom one', () => {
    rmSync(join(home, '.bashrc'), { force: true })
    writeFileSync(join(home, '.bashrc'), "PS1='\\s-\\v\\$ '\n")
    expect(run({ file: '/bin/bash', args: [], env: {} }, 'echo "$PS1"')).toContain('❯')

    writeFileSync(join(home, '.bashrc'), "PS1='custom>'\n")
    expect(run({ file: '/bin/bash', args: [], env: {} }, 'echo "$PS1"')).toBe('custom>')
  })
})
