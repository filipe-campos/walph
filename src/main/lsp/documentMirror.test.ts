import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DocumentMirror } from './documentMirror'
import { pathToUri } from './uri'

const init = (path: string, text = 'abc', version = 1, serverId: string | null = 'ts') => ({
  path,
  text,
  version,
  languageId: 'typescript',
  serverId
})
const at = (line: number, character: number) => ({ line, character })

describe('DocumentMirror', () => {
  it('open creates the document and returns the previous one with the same path', () => {
    const mirror = new DocumentMirror()
    const first = mirror.open(init('/p/a.ts'))
    expect(first.previous).toBeUndefined()
    expect(first.doc).toMatchObject({ path: '/p/a.ts', uri: pathToUri('/p/a.ts'), diagnostics: [], serverId: 'ts' })
    const second = mirror.open(init('/p/a.ts', 'new', 5))
    expect(second.previous).toBe(first.doc)
    expect(mirror.get('/p/a.ts')?.text).toBe('new')
    expect(mirror.has('/p/a.ts')).toBe(true)
  })

  it('change applies the changes and the version; an unknown path does nothing', () => {
    const mirror = new DocumentMirror()
    mirror.open(init('/p/a.ts', 'abc'))
    const doc = mirror.change('/p/a.ts', 2, [{ range: { start: at(0, 1), end: at(0, 2) }, text: 'XY' }])
    expect(doc).toMatchObject({ text: 'aXYc', version: 2 })
    expect(mirror.change('/p/other.ts', 3, [])).toBeUndefined()
  })

  it('close removes and returns the document; clear empties it', () => {
    const mirror = new DocumentMirror()
    mirror.open(init('/p/a.ts'))
    mirror.open(init('/p/b.ts'))
    expect(mirror.close('/p/a.ts')?.path).toBe('/p/a.ts')
    expect(mirror.close('/p/a.ts')).toBeUndefined()
    expect([...mirror.values()]).toHaveLength(1)
    mirror.clear()
    expect([...mirror.values()]).toHaveLength(0)
  })

  it('forServer filters by the document server', () => {
    const mirror = new DocumentMirror()
    mirror.open(init('/p/a.ts', 'a', 1, 'ts'))
    mirror.open(init('/p/b.py', 'b', 1, 'py'))
    mirror.open(init('/p/c.txt', 'c', 1, null))
    expect(mirror.forServer('ts').map((d) => d.path)).toEqual(['/p/a.ts'])
    expect(mirror.forServer('go')).toEqual([])
  })

  it('editContext exposes version and path of the open ones and refuses without a folder', () => {
    const mirror = new DocumentMirror()
    mirror.open(init('/p/a.ts', 'abc', 7))
    const ctx = mirror.editContext('/p')
    expect(ctx.root).toBe('/p')
    expect(ctx.versionOf?.('/p/a.ts')).toBe(7)
    expect(ctx.versionOf?.('/p/b.ts')).toBeUndefined()
    expect(ctx.openPath?.('/p/a.ts')).toBe('/p/a.ts')
    expect(() => mirror.editContext(null)).toThrow('Nenhuma pasta aberta nesta janela.')
  })

  it('canon prefers the path the document was opened with', () => {
    const mirror = new DocumentMirror()
    mirror.open(init('/p/a.ts'))
    expect(mirror.canon('/p')('/p/a.ts')).toBe('/p/a.ts')
    expect(mirror.canon('/p')('/p/sub/x.ts')).toBe(join('/p', 'sub', 'x.ts'))
    expect(mirror.canon(null)('/outside/x.ts')).toBe('/outside/x.ts')
  })
})
