import { describe, expect, it, vi } from 'vitest'
import type { SnippetFile, UserSnippet } from '@shared/types'

const actions = vi.hoisted(() => ({
  askSnippetFileName: vi.fn(),
  emmetWrap: vi.fn(),
  insertSnippet: vi.fn(),
  openSnippetFile: vi.fn()
}))
vi.mock('../../snippetActions', () => actions)

const { buildConfigureSnippetsList, buildEmmetWrapList, buildInsertSnippetList, buildSnippetFileNameList } =
  await import('./buildSnippetItems')

const snippet = (name: string, scopes: string[] | null, patch: Partial<UserSnippet> = {}): UserSnippet => ({
  name,
  prefixes: [name.toLowerCase()],
  body: name,
  scopes,
  source: 'user',
  file: `/u/snippets/${name}.code-snippets`,
  ...patch
})

describe('buildInsertSnippetList', () => {
  const snippets = [
    snippet('Log', ['typescript']),
    snippet('Todo', null, { source: 'workspace' }),
    snippet('Py', ['python'])
  ]

  it('only the snippets of the tab language (and the unscoped ones)', () => {
    const list = buildInsertSnippetList('', { path: '/a.ts', chosen: null, snippets })
    expect(list.items.map((i) => i.key)).toEqual([
      '/u/snippets/Log.code-snippets:Log',
      '/u/snippets/Todo.code-snippets:Todo'
    ])
    expect(list.items[1]?.tag).toBe('todo · workspace')
    list.items[0]?.run()
    expect(actions.insertSnippet).toHaveBeenCalledWith(snippets[0])
  })

  it('without a file or without snippets shows the message', () => {
    expect(buildInsertSnippetList('', { path: null, chosen: null, snippets }).message).toBe(
      'Abra um arquivo para inserir um snippet.'
    )
    expect(buildInsertSnippetList('', { path: '/a.rs', chosen: null, snippets: [snippets[2]] }).items).toEqual([])
  })
})

describe('buildConfigureSnippetsList', () => {
  const files: SnippetFile[] = [
    { kind: 'global', name: 'mine', path: '/u/snippets/mine.code-snippets' },
    { kind: 'language', name: 'typescript', path: '/u/snippets/typescript.json' }
  ]

  it('existing files, create new and languages (the tab one first)', () => {
    const { items } = buildConfigureSnippetsList('', { files, root: '/repo', path: '/a.ts', chosen: null })
    expect(items.slice(0, 3).map((i) => i.key)).toEqual([
      'file:/u/snippets/mine.code-snippets',
      'new:global',
      'new:workspace'
    ])
    expect(items[3]).toMatchObject({ key: 'language:typescript', tag: 'atual', icon: 'codicon-file-code' })
    items[3]?.run()
    expect(actions.openSnippetFile).toHaveBeenCalledWith('language', 'typescript')
  })

  it('without a folder, without the workspace option', () => {
    const { items } = buildConfigureSnippetsList('', { files: [], root: null, path: null, chosen: null })
    expect(items.some((i) => i.key === 'new:workspace')).toBe(false)
  })
})

describe('file name and Emmet', () => {
  it('creates `<name>.code-snippets`, without repeating the extension', () => {
    const { items } = buildSnippetFileNameList(' mine.code-snippets ', 'workspace')
    expect(items[0]?.label).toBe('Criar mine.code-snippets')
    items[0]?.run()
    expect(actions.openSnippetFile).toHaveBeenCalledWith('workspace', 'mine')
    expect(buildSnippetFileNameList('  ', 'global').items).toEqual([])
  })

  it('wrap asks for the abbreviation and passes it on', () => {
    expect(buildEmmetWrapList('').items).toEqual([])
    buildEmmetWrapList(' ul>li* ').items[0]?.run()
    expect(actions.emmetWrap).toHaveBeenCalledWith('ul>li*')
  })
})
