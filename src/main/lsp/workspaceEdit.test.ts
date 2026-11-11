import { describe, expect, it } from 'vitest'
import { normalizeWorkspaceEdit } from './workspaceEdit'

const r = (l: number, a: number, b: number) => ({ start: { line: l, character: a }, end: { line: l, character: b } })
const ctx = { root: '/proj', platform: 'linux' }

describe('normalizeWorkspaceEdit', () => {
  it('changes: groups by file keeping the order of the edits', () => {
    const edit = normalizeWorkspaceEdit(
      {
        changes: {
          'file:///proj/a.ts': [
            { range: r(0, 0, 1), newText: 'x' },
            { range: r(2, 0, 1), newText: 'y' }
          ],
          'file:///proj/b.ts': [{ range: r(0, 0, 1), newText: 'z' }]
        }
      },
      ctx
    )
    expect(edit.files.map((f) => f.path)).toEqual(['/proj/a.ts', '/proj/b.ts'])
    expect(edit.files[0].edits.map((e) => e.newText)).toEqual(['x', 'y'])
  })

  it('documentChanges takes precedence over changes', () => {
    const edit = normalizeWorkspaceEdit(
      {
        changes: { 'file:///proj/ignored.ts': [{ range: r(0, 0, 0), newText: 'n' }] },
        documentChanges: [
          { textDocument: { uri: 'file:///proj/a.ts', version: null }, edits: [{ range: r(0, 0, 1), newText: '1' }] }
        ]
      },
      ctx
    )
    expect(edit.files.map((f) => f.path)).toEqual(['/proj/a.ts'])
  })

  it('the same file twice in documentChanges (steps) throws; in changes the lists are merged', () => {
    const doc = (uri: string) => ({
      textDocument: { uri, version: null },
      edits: [{ range: r(0, 0, 1), newText: '1' }]
    })
    expect(() =>
      normalizeWorkspaceEdit(
        { documentChanges: [doc('file:///proj/a.ts'), doc('file:///proj/A.ts')] },
        { ...ctx, platform: 'darwin' }
      )
    ).toThrow(/em etapas/)
    const merged = normalizeWorkspaceEdit(
      {
        changes: {
          'file:///proj/a.ts': [{ range: r(0, 0, 1), newText: '1' }],
          'file:///proj/A.ts': [{ range: r(1, 0, 1), newText: '2' }]
        }
      },
      { ...ctx, platform: 'darwin' }
    )
    expect(merged.files).toHaveLength(1)
    expect(merged.files[0].edits).toHaveLength(2)
  })

  it('includes the mirror version and the path the document was opened with', () => {
    const edit = normalizeWorkspaceEdit(
      { changes: { 'file:///c%3A/proj/a.ts': [{ range: r(0, 0, 1), newText: 'x' }] } },
      {
        root: 'C:\\proj',
        platform: 'win32',
        versionOf: () => 7,
        openPath: () => 'C:\\proj\\a.ts'
      }
    )
    expect(edit.files).toEqual([{ path: 'C:\\proj\\a.ts', version: 7, edits: [{ range: r(0, 0, 1), newText: 'x' }] }])
  })

  it('a closed file inside the folder uses the folder spelling and has no version', () => {
    const edit = normalizeWorkspaceEdit(
      { changes: { 'file:///c%3A/proj/src/B.ts': [{ range: r(0, 0, 1), newText: 'x' }] } },
      { root: 'C:\\proj', platform: 'win32' }
    )
    expect(edit.files[0].path).toBe('C:\\proj\\src\\B.ts')
    expect(edit.files[0].version).toBeUndefined()
  })

  it('file operations throw a pt-BR error', () => {
    for (const kind of ['create', 'rename', 'delete']) {
      expect(() => normalizeWorkspaceEdit({ documentChanges: [{ kind, uri: 'file:///proj/a.ts' }] }, ctx)).toThrow(
        /criar, renomear ou apagar/
      )
    }
  })

  it('a file outside the folder or not file:// throws', () => {
    const outside = { changes: { 'file:///other/a.ts': [{ range: r(0, 0, 0), newText: 'x' }] } }
    expect(() => normalizeWorkspaceEdit(outside, ctx)).toThrow(/fora da pasta/)
    const remote = { changes: { 'untitled:x': [{ range: r(0, 0, 0), newText: 'x' }] } }
    expect(() => normalizeWorkspaceEdit(remote, ctx)).toThrow(/não é um arquivo/)
    const sibling = { changes: { 'file:///proj-x/a.ts': [{ range: r(0, 0, 0), newText: 'x' }] } }
    expect(() => normalizeWorkspaceEdit(sibling, ctx)).toThrow(/fora da pasta/)
  })

  it('a version different from the open document throws; a closed document does not block', () => {
    const edit = (version: number) => ({
      documentChanges: [
        { textDocument: { uri: 'file:///proj/a.ts', version }, edits: [{ range: r(0, 0, 0), newText: 'x' }] }
      ]
    })
    expect(() => normalizeWorkspaceEdit(edit(2), { ...ctx, versionOf: () => 5 })).toThrow(/versão antiga/)
    expect(normalizeWorkspaceEdit(edit(5), { ...ctx, versionOf: () => 5 }).files).toHaveLength(1)
    expect(normalizeWorkspaceEdit(edit(2), { ...ctx, versionOf: () => undefined }).files).toHaveLength(1)
  })

  it('any malformed part throws (no applying only a part)', () => {
    const bad = (raw: unknown) => expect(() => normalizeWorkspaceEdit(raw, ctx)).toThrow(/malformada/)
    bad({ changes: { 'file:///proj/a.ts': [{ newText: 1 }] } })
    bad({
      changes: {
        'file:///proj/a.ts': [
          { range: r(0, 0, 0), newText: 'ok' },
          { range: { start: 1 }, newText: '' }
        ]
      }
    })
    bad({ changes: { 'file:///proj/a.ts': 'x' } })
    bad({ documentChanges: [{ edits: [] }] })
    bad({ documentChanges: [3] })
    bad({ documentChanges: {} })
    bad(null)
    bad(undefined)
  })

  it('a truly empty edit is empty', () => {
    expect(normalizeWorkspaceEdit({}, ctx)).toEqual({ files: [] })
    expect(normalizeWorkspaceEdit({ changes: { 'file:///proj/a.ts': [] } }, ctx)).toEqual({ files: [] })
  })
})
