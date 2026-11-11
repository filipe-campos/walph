import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeApi } from './test/fakeApi'

const files = new Map<string, string>()
const exists = vi.fn((path: string) => Promise.resolve(files.has(path)))
const readFile = vi.fn((path: string) => Promise.resolve(files.get(path) ?? ''))
const { emit } = installFakeApi({
  fs: { exists: (path) => exists(path), readFile: (path) => readFile(path) }
})

const { useStore } = await import('./store')
const { resetStore } = await import('./test/resetStore')
const { editorConfigFor, prepareTabEditorConfig, resolveTabIndent, startEditorConfigReactions, tabEditorConfig } =
  await import('./editorConfigActions')

let stop: () => void
let run = 0

beforeEach(() => {
  resetStore()
  files.clear()
  exists.mockClear()
  readFile.mockClear()
  stop = startEditorConfigReactions()
  // Another folder empties the per-folder cache: each test reads from scratch.
  useStore.setState({ root: `/run${run++}` })
})

afterEach(() => stop())

describe('editorConfigFor', () => {
  it('walks up the folders until root = true and the closest one wins', async () => {
    files.set('/.editorconfig', '[*]\nindent_size = 8')
    files.set('/p/.editorconfig', 'root = true\n[*]\nindent_style = space\nindent_size = 2')
    files.set('/p/src/.editorconfig', '[*.ts]\nindent_size = 4')
    expect(await editorConfigFor('/p/src/a.ts')).toEqual({ indentStyle: 'space', indentSize: 4, tabWidth: 4 })
    expect(await editorConfigFor('/p/src/a.md')).toEqual({ indentStyle: 'space', indentSize: 2, tabWidth: 2 })
  })

  it('reads each folder once and rereads the one the watcher reports as changed', async () => {
    files.set('/q/.editorconfig', 'root = true\n[*]\nmax_line_length = 80')
    await editorConfigFor('/q/a.ts')
    await editorConfigFor('/q/b.ts')
    expect(readFile).toHaveBeenCalledTimes(1)

    files.set('/q/.editorconfig', 'root = true\n[*]\nmax_line_length = 100')
    expect(await editorConfigFor('/q/a.ts')).toEqual({ maxLineLength: 80 })
    emit.workspace.onChange({ dirs: [], files: [{ path: '/q/.editorconfig', type: 'change' }] })
    expect(await editorConfigFor('/q/a.ts')).toEqual({ maxLineLength: 100 })
    expect(readFile).toHaveBeenCalledTimes(2)
  })

  it('a folder without .editorconfig is not read; a read failure counts as missing', async () => {
    files.set('/x/.editorconfig', '[*]\nindent_size = 3')
    readFile.mockRejectedValueOnce(new Error('EACCES'))
    expect(await editorConfigFor('/x/a.ts')).toEqual({})
    expect(readFile).toHaveBeenCalledTimes(1)
  })
})

describe('resolveTabIndent', () => {
  it('the tab EditorConfig beats the detected indentation and is no longer a fallback', async () => {
    files.set('/w/.editorconfig', 'root = true\n[*]\nindent_style = tab\ntab_width = 6')
    await prepareTabEditorConfig('w', '/w/a.c')
    expect(tabEditorConfig('w')).toEqual({ indentStyle: 'tab', indentSize: 'tab', tabWidth: 6 })
    expect(resolveTabIndent('w', 'a\n  b\n')).toEqual({ indent: { kind: 'tabs', width: 6 }, fallback: false })
    expect(resolveTabIndent('no-config', 'a\n')).toEqual({ indent: { kind: 'spaces', size: 2 }, fallback: true })
  })
})
