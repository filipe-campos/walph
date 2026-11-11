import { describe, expect, it } from 'vitest'
import type { DirEntry } from '@shared/types'
import { flattenTree, moveTargetDir, moveTargetDirAll, treeKeyAction, treeKeyName, visibleRange } from './explorerTree'

const f = (dir: string, name: string): DirEntry => ({ name, path: `${dir}/${name}`, isDirectory: false })
const d = (dir: string, name: string): DirEntry => ({ name, path: `${dir}/${name}`, isDirectory: true })

describe('flattenTree', () => {
  const dirs = { '/r': [d('/r', 'src'), f('/r', 'a.txt')], '/r/src': [f('/r/src', 'x.ts')] }
  const all = () => true

  it('a closed folder does not show children', () => {
    const rows = flattenTree('/r', dirs, {}, all, null)
    expect(rows.map((r) => r.key)).toEqual(['/r/src', '/r/a.txt'])
  })

  it('an open folder shows children with depth', () => {
    const rows = flattenTree('/r', dirs, { '/r/src': true }, all, null)
    expect(rows.map((r) => [r.key, r.depth])).toEqual([
      ['/r/src', 0],
      ['/r/src/x.ts', 1],
      ['/r/a.txt', 0]
    ])
  })

  it('applies the filter and the creation row', () => {
    const rows = flattenTree('/r', dirs, { '/r/src': true }, (e) => e.name !== 'a.txt', {
      mode: 'newFile',
      dir: '/r/src'
    })
    expect(rows.map((r) => r.kind)).toEqual(['entry', 'create', 'entry'])
  })
})

describe('visibleRange', () => {
  it('clamps to the total and applies the overscan', () => {
    expect(visibleRange(1000, 0, 220, 22, 5)).toEqual({ start: 0, end: 15 })
    expect(visibleRange(1000, 2200, 220, 22, 5)).toEqual({ start: 95, end: 115 })
    expect(visibleRange(10, 0, 2200, 22, 5)).toEqual({ start: 0, end: 10 })
  })
})

describe('treeKeyAction', () => {
  const dirs = {
    '/r': [d('/r', 'src'), d('/r', 'empty'), f('/r', 'a.txt')],
    '/r/src': [f('/r/src', 'x.ts')],
    '/r/empty': []
  }
  const rows = flattenTree('/r', dirs, { '/r/src': true, '/r/empty': true }, () => true, null)
  const key = (path: string, k: string) => treeKeyAction(rows, path, k)

  it('arrows, Home and End move the selection without leaving the list', () => {
    expect(key('/r/src', 'ArrowDown')).toEqual({ type: 'select', path: '/r/src/x.ts' })
    expect(key('/r/src', 'ArrowUp')).toEqual({ type: 'select', path: '/r/src' })
    expect(key('/r/a.txt', 'ArrowDown')).toEqual({ type: 'select', path: '/r/a.txt' })
    expect(key('/r/a.txt', 'Home')).toEqual({ type: 'select', path: '/r/src' })
    expect(key('/r/src', 'End')).toEqual({ type: 'select', path: '/r/a.txt' })
  })

  it('← collapses the open folder or goes to the parent; → expands or goes to the first child', () => {
    expect(key('/r/src', 'ArrowLeft')).toEqual({ type: 'collapse', path: '/r/src' })
    expect(key('/r/src/x.ts', 'ArrowLeft')).toEqual({ type: 'select', path: '/r/src' })
    expect(key('/r/a.txt', 'ArrowLeft')).toBeNull()
    expect(key('/r/src', 'ArrowRight')).toEqual({ type: 'select', path: '/r/src/x.ts' })
    expect(key('/r/empty', 'ArrowRight')).toBeNull()
    const closed = flattenTree('/r', dirs, {}, () => true, null)
    expect(treeKeyAction(closed, '/r/src', 'ArrowRight')).toEqual({ type: 'expand', path: '/r/src' })
    expect(key('/r/a.txt', 'ArrowRight')).toBeNull()
  })

  it('Enter renames, Space activates and the rest is ignored', () => {
    expect(key('/r/a.txt', 'Enter')).toEqual({ type: 'rename', path: '/r/a.txt' })
    expect(key('/r/a.txt', ' ')).toEqual({ type: 'activate', path: '/r/a.txt' })
    expect(key('/r/a.txt', 'x')).toBeNull()
    expect(key('/nao/existe', 'Enter')).toBeNull()
  })
})

describe('treeKeyAction Delete', () => {
  it('Delete asks to delete the row; an unknown path is ignored', () => {
    const rows = flattenTree(
      '/r',
      { '/r': [{ name: 'a.ts', path: '/r/a.ts', isDirectory: false }] },
      {},
      () => true,
      null
    )
    expect(treeKeyAction(rows, '/r/a.ts', 'Delete')).toEqual({ type: 'delete', path: '/r/a.ts' })
    expect(treeKeyAction(rows, '/r/x', 'Delete')).toBeNull()
  })
})

describe('treeKeyName', () => {
  const mods = { metaKey: false, ctrlKey: false, altKey: false }
  it('⌘⌫ becomes Delete only on macOS', () => {
    expect(treeKeyName({ key: 'Backspace', ...mods, metaKey: true }, 'darwin')).toBe('Delete')
    expect(treeKeyName({ key: 'Backspace', ...mods, metaKey: true }, 'win32')).toBeNull()
    expect(treeKeyName({ key: 'Backspace', ...mods }, 'darwin')).toBe('Backspace')
  })
  it('Shift with arrows and Mod+A', () => {
    expect(treeKeyName({ key: 'ArrowDown', ...mods, shiftKey: true }, 'linux')).toBe('Shift+ArrowDown')
    expect(treeKeyName({ key: 'Enter', ...mods, shiftKey: true }, 'linux')).toBe('Enter')
    expect(treeKeyName({ key: 'a', ...mods, metaKey: true }, 'darwin')).toBe('Mod+a')
    expect(treeKeyName({ key: 'a', ...mods, ctrlKey: true }, 'darwin')).toBeNull()
    expect(treeKeyName({ key: 'a', ...mods, ctrlKey: true }, 'win32')).toBe('Mod+a')
    expect(treeKeyName({ key: 'a', ...mods, metaKey: true }, 'win32')).toBeNull()
  })
  it('Ctrl/Alt and other combinations with ⌘ are ignored', () => {
    expect(treeKeyName({ key: 'Delete', ...mods, ctrlKey: true }, 'linux')).toBeNull()
    expect(treeKeyName({ key: 'ArrowDown', ...mods, metaKey: true }, 'darwin')).toBeNull()
    expect(treeKeyName({ key: 'Delete', ...mods }, 'linux')).toBe('Delete')
  })
})

describe('moveTargetDir', () => {
  const dir = (path: string) => ({ path, isDirectory: true })
  const file = (path: string) => ({ path, isDirectory: false })
  it('a folder receives into itself, a file into the parent folder, empty into the root', () => {
    expect(moveTargetDir('/r', dir('/r/b'), '/r/a.ts', 'linux')).toBe('/r/b')
    expect(moveTargetDir('/r', file('/r/b/c.ts'), '/r/a.ts', 'linux')).toBe('/r/b')
    expect(moveTargetDir('/r', null, '/r/b/c.ts', 'linux')).toBe('/r')
  })
  it('ignores dropping on itself, on a descendant and on the current folder', () => {
    expect(moveTargetDir('/r', dir('/r/b'), '/r/b', 'linux')).toBeNull()
    expect(moveTargetDir('/r', dir('/r/b/c'), '/r/b', 'linux')).toBeNull()
    expect(moveTargetDir('/r', file('/r/a.ts'), '/r/b.ts', 'linux')).toBeNull()
    expect(moveTargetDir('/r', null, '/r/a.ts', 'linux')).toBeNull()
  })
  it('a sibling folder with a similar prefix is not a descendant; case counts where the OS ignores it', () => {
    expect(moveTargetDir('/r', dir('/r/bb'), '/r/b', 'linux')).toBe('/r/bb')
    expect(moveTargetDir('/r', dir('/r/B'), '/r/b', 'darwin')).toBeNull()
  })
})

describe('moveTargetDirAll', () => {
  const dir = (path: string) => ({ path, isDirectory: true })
  it('accepts if some item changes folder and none is the folder or an ancestor of it', () => {
    expect(moveTargetDirAll('/r', dir('/r/b'), ['/r/a.ts', '/r/b/c.ts'], 'linux')).toBe('/r/b')
    expect(moveTargetDirAll('/r', dir('/r/b'), ['/r/b/c.ts'], 'linux')).toBeNull()
    expect(moveTargetDirAll('/r', dir('/r/b/x'), ['/r/a.ts', '/r/b'], 'linux')).toBeNull()
    expect(moveTargetDirAll('/r', dir('/r/b'), ['/r/a.ts', '/r/b'], 'linux')).toBeNull()
  })
})
