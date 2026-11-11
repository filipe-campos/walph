// Checks that the paths cited in backticks in the docs (CLAUDE.md, README, CONTRIBUTING, docs/, the skills, agents,
// commands and git/ of .claude) still exist.
// Usage: `pnpm docs:check [files.md…]`. Exits with 1 and lists `file:line` for each path that no longer exists.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')

const FILE_EXT = /\.(?:ts|tsx|mts|cts|js|mjs|cjs|css|html|md|ya?ml|sh|json|jsonc)$/

// Cited on purpose without existing in the repo: created at runtime/build time, or name and fixture examples.
const NOT_REPO_PATHS = new Set([
  '.walph/settings.json',
  '.vscode/launch.json',
  'PascalCase.tsx',
  'AUDIT.html',
  'compose.yaml',
  'name.test.ts',
  'src/index.ts',
  'src/utils/math.ts'
])

// A token that can be a repo path. Placeholders (`<domain>`), globs, URLs, commands with spaces, aliases
// (`@shared/…`) and bare names that are not code files are left out.
export function isPathLike(token) {
  if (!token || /[\s<>*{}…$?|()[\]'"=,;]/.test(token)) return false
  if (token.includes('://') || /^[-~@]/.test(token)) return false
  if (token.includes('/')) return /[A-Za-z]/.test(token) && (FILE_EXT.test(token) || token.endsWith('/'))
  // `.test.ts` is a suffix and `windows.json` a userData file, not a repo one.
  return FILE_EXT.test(token) && !token.startsWith('.') && !token.endsWith('.json')
}

// `{ line, token }` of each path in backticks outside code blocks (which hold code, not references).
export function extractPathRefs(markdown) {
  const refs = []
  let fenced = false
  markdown.split('\n').forEach((text, index) => {
    if (/^\s*(```|~~~)/.test(text)) {
      fenced = !fenced
      return
    }
    if (fenced) return
    for (const match of text.matchAll(/`([^`]+)`/g)) {
      const token = match[1].trim().replace(/:\d+(?:-\d+)?$/, '')
      if (isPathLike(token) && !NOT_REPO_PATHS.has(token)) refs.push({ line: index + 1, token })
    }
  })
  return refs
}

// The docs cite paths relative to the layer (`ipc/git.ts`, `lib/path.ts`): a path with a slash must end a repo file
// or folder in whole segments (`c/git.ts` and `hemes/types.ts` do not count). A bare name (`store.ts`, `index.ts`) is
// the shorthand of a text already talking about the layer and matches the whole file name, in any folder.
export function createResolver(files, existsAtRoot = () => false) {
  const known = new Set()
  for (const file of files) {
    const parts = file.split('/')
    for (let start = 0; start < parts.length; start++) {
      known.add(parts.slice(start).join('/'))
      // Folder = any contiguous run that ends before the file name (`window/`, `components/claude/`).
      for (let end = start + 1; end < parts.length; end++) known.add(`${parts.slice(start, end).join('/')}/`)
    }
  }
  return (token) => {
    const clean = token.replace(/^\.\//, '')
    return known.has(clean) || existsAtRoot(clean)
  }
}

// Paths the repo `.gitignore` covers (build output, local settings) are cited on purpose and only exist on some machines.
export function gitIgnored(paths, cwd = ROOT) {
  if (paths.length === 0) return new Set()
  const result = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], { cwd, input: paths.join('\n') })
  // Exit 1 = none ignored; anything above is a git error, which must not hide broken paths.
  if (result.status !== 0 && result.status !== 1) throw new Error(`git check-ignore failed: ${result.stderr}`)
  return new Set(result.stdout.toString('utf8').split('\n').filter(Boolean))
}

function repoFiles() {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: ROOT })
  return out.toString('utf8').split('\0').filter(Boolean)
}

// `.claude/commands/local` is ignored by git (personal work plans).
const SKIPPED_DIRS = ['.claude/commands/local']

// Path relative to the root always with `/` (on Windows `relative` returns `\\`).
export const toRepoPath = (path, separator = sep) => path.split(separator).join('/')

export const isSkippedDoc = (path) => SKIPPED_DIRS.some((skipped) => path.startsWith(`${skipped}/`))

function markdownIn(dir, recursive) {
  const docs = []
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true, recursive })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const path = toRepoPath(relative(ROOT, join(entry.parentPath, entry.name)))
    if (!isSkippedDoc(path)) docs.push(path)
  }
  return docs
}

export function defaultDocs() {
  const docs = readdirSync(ROOT).filter(
    (name) => name === 'CLAUDE.md' || name === 'CONTRIBUTING.md' || /^README.*\.md$/.test(name)
  )
  for (const dir of ['.claude/skills', '.claude/agents', '.claude/commands', '.claude/git'])
    docs.push(...markdownIn(dir, true))
  docs.push(...markdownIn('docs', false))
  return docs.sort()
}

function main(args) {
  const docs = args.length > 0 ? args : defaultDocs()
  const resolves = createResolver(repoFiles(), (path) => existsSync(join(ROOT, path)))
  const unresolved = []
  let checked = 0
  for (const doc of docs) {
    for (const { line, token } of extractPathRefs(readFileSync(join(ROOT, doc), 'utf8'))) {
      checked++
      if (!resolves(token)) unresolved.push({ doc, line, token })
    }
  }
  const ignored = gitIgnored([...new Set(unresolved.map(({ token }) => token))])
  const missing = unresolved
    .filter(({ token }) => !ignored.has(token))
    .map(({ doc, line, token }) => `${doc}:${line}  ${token}`)
  if (missing.length === 0) {
    console.log(`docs:check: ${checked} paths in ${docs.length} files, none broken.`)
    return 0
  }
  console.error(`docs:check: ${missing.length} path(s) that do not exist in the repo:\n${missing.join('\n')}`)
  return 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
