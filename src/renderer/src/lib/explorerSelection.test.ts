import { describe, expect, it } from 'vitest'
import {
  collapseToFocused,
  EMPTY_SELECTION,
  extendSelection,
  hideInside,
  outermostPaths,
  pruneSelection,
  rebaseSelection,
  selectAllVisible,
  selectionAfterClick,
  type ExplorerSelection
} from './explorerSelection'

const visible = ['/r/a', '/r/b', '/r/c', '/r/d']
const sel = (
  selection: string[],
  focused: string | null = selection.at(-1) ?? null,
  anchor = focused
): ExplorerSelection => ({
  selection,
  focused,
  anchor
})

describe('selectionAfterClick', () => {
  it('a plain click replaces everything with the row', () => {
    expect(selectionAfterClick(sel(['/r/a', '/r/b']), '/r/c', 'single', visible)).toEqual(sel(['/r/c']))
  })

  it('toggle turns on and off keeping the order and moves focus and anchor', () => {
    const one = selectionAfterClick(sel(['/r/a']), '/r/c', 'toggle', visible)
    expect(one).toEqual({ selection: ['/r/a', '/r/c'], focused: '/r/c', anchor: '/r/c' })
    expect(selectionAfterClick(one, '/r/a', 'toggle', visible).selection).toEqual(['/r/c'])
  })

  it('a range goes from the anchor to the row, in both directions, without touching the anchor', () => {
    const down = selectionAfterClick(sel(['/r/b']), '/r/d', 'range', visible)
    expect(down).toEqual({ selection: ['/r/b', '/r/c', '/r/d'], focused: '/r/d', anchor: '/r/b' })
    const up = selectionAfterClick(down, '/r/a', 'range', visible)
    expect(up.selection).toEqual(['/r/a', '/r/b'])
    expect(up.anchor).toBe('/r/b')
  })

  it('a range without a visible anchor becomes a plain selection', () => {
    expect(selectionAfterClick(EMPTY_SELECTION, '/r/c', 'range', visible)).toEqual(sel(['/r/c']))
    expect(selectionAfterClick(sel(['/x']), '/r/c', 'range', visible)).toEqual(sel(['/r/c']))
  })

  it('does not change the original selection', () => {
    const cur = sel(['/r/a'])
    selectionAfterClick(cur, '/r/b', 'toggle', visible)
    expect(cur.selection).toEqual(['/r/a'])
  })
})

describe('keyboard', () => {
  it('Shift+arrow extends from the anchor', () => {
    const next = extendSelection(sel(['/r/b']), '/r/c', visible)
    expect(next.selection).toEqual(['/r/b', '/r/c'])
    expect(extendSelection(next, '/r/b', visible).selection).toEqual(['/r/b'])
  })

  it('select all keeps the focus', () => {
    const all = selectAllVisible(sel(['/r/b']), visible)
    expect(all).toEqual({ selection: visible, focused: '/r/b', anchor: '/r/b' })
  })

  it('Esc goes back to the focused item', () => {
    expect(collapseToFocused(sel(['/r/a', '/r/b'], '/r/b'))).toEqual(sel(['/r/b']))
    expect(collapseToFocused(sel([], null))).toEqual(EMPTY_SELECTION)
  })
})

describe('rebaseSelection and pruneSelection', () => {
  it('renaming a folder takes what was inside it', () => {
    const cur = sel(['/r/src', '/r/src/a.ts', '/r/b'], '/r/src/a.ts', '/r/src')
    expect(rebaseSelection(cur, '/r/src', '/r/lib')).toEqual({
      selection: ['/r/lib', '/r/lib/a.ts', '/r/b'],
      focused: '/r/lib/a.ts',
      anchor: '/r/lib'
    })
  })

  it('does not confuse a name prefix', () => {
    expect(rebaseSelection(sel(['/r/src2']), '/r/src', '/r/lib').selection).toEqual(['/r/src2'])
  })

  it('removing prunes the item and what was inside, and clears the lost focus and anchor', () => {
    const cur = sel(['/r/src', '/r/src/a.ts', '/r/b'], '/r/src/a.ts', '/r/src')
    expect(pruneSelection(cur, '/r/src')).toEqual({ selection: ['/r/b'], focused: null, anchor: null })
  })
})

describe('outermostPaths', () => {
  it('drops what is inside another item of the list', () => {
    expect(outermostPaths(['/r/src/a.ts', '/r/src', '/r/b'])).toEqual(['/r/src', '/r/b'])
    expect(outermostPaths(['/r/src2', '/r/src'])).toEqual(['/r/src2', '/r/src'])
  })
})

describe('hideInside', () => {
  it('collapsing a folder removes the selection inside it and moves the focus to the folder', () => {
    const cur = sel(['/r/src', '/r/src/a.ts', '/r/b'], '/r/src/a.ts', '/r/src/a.ts')
    expect(hideInside(cur, '/r/src')).toEqual({ selection: ['/r/src', '/r/b'], focused: '/r/src', anchor: '/r/src' })
  })
})
