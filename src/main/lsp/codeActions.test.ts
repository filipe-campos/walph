import { describe, expect, it } from 'vitest'
import { diagnosticsForRange, isActionable, needsResolve, normalizeCodeAction } from './codeActions'

const r = (l: number, a: number, b: number) => ({ start: { line: l, character: a }, end: { line: l, character: b } })
const ctx = { root: '/p', platform: 'linux' }
const edit = { changes: { 'file:///p/a.ts': [{ range: r(0, 0, 1), newText: 'x' }] } }

describe('normalizeCodeAction', () => {
  it('CodeAction with edit, kind and preferred', () => {
    expect(normalizeCodeAction({ title: 'Fix', kind: 'quickfix', isPreferred: true, edit }, ctx)).toEqual({
      title: 'Fix',
      kind: 'quickfix',
      isPreferred: true,
      edit: { files: [{ path: '/p/a.ts', edits: [{ range: r(0, 0, 1), newText: 'x' }] }] }
    })
  })

  it('a bare Command becomes an action with command', () => {
    expect(normalizeCodeAction({ title: 'Organize', command: 'ts.organize', arguments: [1] }, ctx)).toEqual({
      title: 'Organize',
      command: { title: 'Organize', command: 'ts.organize', arguments: [1] }
    })
  })

  it('CodeAction with an object command', () => {
    const a = normalizeCodeAction({ title: 'X', command: { title: 'X', command: 'c' } }, ctx)!
    expect(a.command).toEqual({ title: 'X', command: 'c' })
  })

  it('disabled.reason', () => {
    expect(normalizeCodeAction({ title: 'X', disabled: { reason: 'Nothing selected' } }, ctx)!.disabled).toBe(
      'Nothing selected'
    )
  })

  it('an unsupported edit leaves the action disabled, without bringing down the list', () => {
    const a = normalizeCodeAction({ title: 'Move', edit: { documentChanges: [{ kind: 'rename' }] } }, ctx)!
    expect(a.edit).toBeUndefined()
    expect(a.disabled).toMatch(/criar, renomear ou apagar/)
    expect(isActionable(a)).toBe(true)
  })

  it('invalid ones become null', () => {
    expect(normalizeCodeAction({ title: '' }, ctx)).toBeNull()
    expect(normalizeCodeAction(null, ctx)).toBeNull()
  })
})

describe('resolution', () => {
  it('only those without edit, command or reason need resolving', () => {
    const raw = { title: 'X', data: 1 }
    const a = normalizeCodeAction(raw, ctx)!
    expect(needsResolve(raw, a)).toBe(true)
    expect(isActionable(a)).toBe(false)
    expect(needsResolve(raw, { ...a, edit: { files: [] } })).toBe(false)
  })
})

describe('diagnosticsForRange', () => {
  it('keeps those touching the range (edges included)', () => {
    const diags = [{ range: r(1, 0, 5) }, { range: r(3, 0, 5) }, { range: r(1, 5, 9) }, { message: 'no range' }]
    expect(diagnosticsForRange(diags, r(1, 5, 5))).toEqual([diags[0], diags[2]])
    expect(diagnosticsForRange(diags, r(2, 0, 2))).toEqual([])
  })
})
