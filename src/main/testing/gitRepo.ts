// Test-only helpers: real git in temporary repositories, isolated from the machine environment.
// Do not import from product code.
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { writeFileAtomicSync } from '../fs/atomicWrite'
import { isolatedGitConfigEnv, makeRealTempDir } from './testEnv'

/**
 * `process.env` without the inherited `ELECTRON_RUN_AS_NODE`, with git isolated from `~/.gitconfig` and with an
 * identity.
 */
function gitTestEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...isolatedGitConfigEnv(),
    GIT_AUTHOR_NAME: 'Walph Test',
    GIT_AUTHOR_EMAIL: 'test@walph.local',
    GIT_COMMITTER_NAME: 'Walph Test',
    GIT_COMMITTER_EMAIL: 'test@walph.local'
  }
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

/**
 * Applies `gitTestEnv()` to `process.env` (for product code that calls git) and returns the function that restores it.
 */
export function useGitTestEnv(): () => void {
  const saved = { ...process.env }
  const env = gitTestEnv()
  for (const key of Object.keys(process.env)) delete process.env[key]
  Object.assign(process.env, env)
  return () => {
    for (const key of Object.keys(process.env)) delete process.env[key]
    Object.assign(process.env, saved)
  }
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, env: gitTestEnv(), stdio: 'pipe', encoding: 'utf8' })
}

/**
 * Creates a repository (`main`) in a temporary folder with its real spelling and returns the path; the caller removes
 * the folder. With `files` and without `commit: false`, makes the initial commit (`message`, default "initial");
 * without files, the repository has no commits.
 */
export function makeTempRepo(
  files: Record<string, string> = {},
  options: { commit?: boolean; message?: string } = {}
): string {
  const dir = makeRealTempDir('walph-repo-')
  git(dir, 'init', '-q', '-b', 'main')
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileAtomicSync(abs, content)
  }
  if (Object.keys(files).length > 0 && options.commit !== false) {
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', options.message ?? 'initial')
  }
  return dir
}
