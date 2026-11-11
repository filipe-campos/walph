import { describe, expect, it } from 'vitest'
import {
  createResolver,
  defaultDocs,
  extractPathRefs,
  gitIgnored,
  isPathLike,
  isSkippedDoc,
  toRepoPath
} from './check-doc-paths.mjs'

describe('isPathLike', () => {
  it('accepts paths with folders, folders with a trailing slash and code file names', () => {
    expect(isPathLike('ipc/git.ts')).toBe(true)
    expect(isPathLike('src/shared/')).toBe(true)
    expect(isPathLike('store.ts')).toBe(true)
    expect(isPathLike('.claude/skills/lsp/SKILL.md')).toBe(true)
  })

  it('ignores placeholders, globs, URLs, aliases, commands and symbols', () => {
    for (const token of [
      'ipc/<domain>.ts',
      'window/hibernation*.ts',
      'app://walph/',
      '@shared/types',
      '--show-cdup',
      'git add -- <paths>',
      'fs:writeFile',
      'workspace.open',
      'kill(-pid)',
      'windows.json',
      '.test.ts',
      'GIT_TERMINAL_PROMPT=0'
    ]) {
      expect(isPathLike(token), token).toBe(false)
    }
  })
})

describe('extractPathRefs', () => {
  it('returns the line of each path and strips the :line suffix', () => {
    const md = 'See `lib/path.ts:12` and `fs/paths.ts`.\n\nNothing here: `workspace.open`.\n- `git/run.ts:3-9`'
    expect(extractPathRefs(md)).toEqual([
      { line: 1, token: 'lib/path.ts' },
      { line: 1, token: 'fs/paths.ts' },
      { line: 4, token: 'git/run.ts' }
    ])
  })

  it('ignores code blocks and paths that are not from the repo', () => {
    const md =
      '```ts\nimport x from `lib/a.ts`\n```\n`.walph/settings.json` `PascalCase.tsx` `AUDIT.html` `compose.yaml`'
    expect(extractPathRefs(md)).toEqual([])
  })
})

describe('createResolver', () => {
  const files = ['src/main/ipc/git.ts', 'src/renderer/src/components/claude/mcp/McpModal.tsx', 'CLAUDE.md']
  const resolves = createResolver(files, (path) => path === 'node_modules/typescript/')

  it('matches by file or folder suffix and by bare name', () => {
    expect(resolves('ipc/git.ts')).toBe(true)
    expect(resolves('src/main/ipc/git.ts')).toBe(true)
    expect(resolves('./CLAUDE.md')).toBe(true)
    expect(resolves('McpModal.tsx')).toBe(true)
    expect(resolves('components/claude/')).toBe(true)
    expect(resolves('src/main/')).toBe(true)
  })

  it('rejects partial name suffixes and missing paths', () => {
    expect(resolves('c/git.ts')).toBe(false)
    expect(resolves('ipc/lsp.ts')).toBe(false)
    expect(resolves('claude/mcp.ts')).toBe(false)
  })

  it('a path with a slash only counts in whole segments; a bare name matches the whole file name', () => {
    const lookup = createResolver(['src/shared/types/index.ts', 'src/renderer/src/themes/types.ts'])
    expect(lookup('types.ts')).toBe(true)
    expect(lookup('themes/types.ts')).toBe(true)
    expect(lookup('shared/types.ts')).toBe(false)
    expect(lookup('hemes/types.ts')).toBe(false)
    expect(lookup('ypes.ts')).toBe(false)
    expect(lookup('shared/types/')).toBe(true)
  })

  it('accepts what exists on disk outside git (ignored ones like node_modules)', () => {
    expect(resolves('node_modules/typescript/')).toBe(true)
  })
})

describe('gitIgnored', () => {
  it('returns only the paths the repo .gitignore covers, even when they are not on disk', () => {
    const paths = ['dist/', 'out/preload/index.js', '.claude/settings.local.json', 'src/main/index.ts', 'nope/x.ts']
    expect(gitIgnored(paths)).toEqual(new Set(['dist/', 'out/preload/index.js', '.claude/settings.local.json']))
  })

  it('does not call git for an empty list', () => {
    expect(gitIgnored([], '/nonexistent')).toEqual(new Set())
  })
})

describe('defaultDocs', () => {
  const docs = defaultDocs()

  it('covers the root docs, docs/, commands, git and skills', () => {
    for (const doc of ['CLAUDE.md', 'README.md', 'CONTRIBUTING.md', 'docs/architecture.md', '.claude/git/commit.md']) {
      expect(docs, doc).toContain(doc)
    }
    expect(docs.some((doc) => doc.startsWith('.claude/commands/'))).toBe(true)
    expect(docs.some((doc) => doc.startsWith('.claude/skills/'))).toBe(true)
  })

  it('leaves out the local plans ignored by git', () => {
    expect(docs.filter((doc) => doc.startsWith('.claude/commands/local/'))).toEqual([])
  })
})

describe('doc paths', () => {
  it('normalizes the Windows separator and ignores .claude/commands/local', () => {
    const path = toRepoPath('.claude\\commands\\local\\plan.md', '\\')
    expect(path).toBe('.claude/commands/local/plan.md')
    expect(isSkippedDoc(path)).toBe(true)
    expect(isSkippedDoc('.claude/commands/github/release.md')).toBe(false)
  })
})
