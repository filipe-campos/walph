import { act, memo } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isItemRow, treeRowProps, useGroupedTree, type TreeGroup } from './useGroupedTree'

const renders = new Map<string, number>()
const roots: Root[] = []

const Row = memo(function Row({ rowKey, tabStop, label }: { rowKey: string; tabStop: boolean; label: string }) {
  renders.set(rowKey, (renders.get(rowKey) ?? 0) + 1)
  return (
    <div {...treeRowProps(rowKey, tabStop)}>
      {label}
      <button>action</button>
      <span className="row-actions" onClick={(e) => e.stopPropagation()}>
        <button>replace</button>
      </span>
    </div>
  )
})

const byLabel = (item: string): string => item

function Tree({
  groups,
  onActivate,
  keyed
}: {
  groups: TreeGroup<string>[]
  onActivate(item: string): void
  keyed?: boolean
}) {
  const { rows, listProps, tabStop } = useGroupedTree({
    groups,
    visible: false,
    ...(keyed && { itemKey: byLabel }),
    onActivateItem: (_g, item: string) => onActivate(item)
  })
  return (
    <div {...listProps}>
      {rows.map((row) => (
        <Row
          key={row.key}
          rowKey={row.key}
          tabStop={row.key === tabStop}
          label={isItemRow(row) ? row.item : row.group.path}
        />
      ))}
    </div>
  )
}

function mount(groups: TreeGroup<string>[], onActivate = vi.fn()) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  roots.push(root)
  act(() => root.render(<Tree groups={groups} onActivate={onActivate} />))
  const rowEls = () => [...host.querySelectorAll<HTMLElement>('[data-row]')]
  return { rowEls, onActivate }
}

function key(el: HTMLElement, k: string): void {
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
  })
}

const items = (n: number) => Array.from({ length: n }, (_, i) => `item ${i}`)

afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  renders.clear()
  document.body.innerHTML = ''
})

describe('useGroupedTree', () => {
  it('moving the cursor in a 5,000-row list only re-renders the rows whose tabStop changed', () => {
    const groups = Array.from({ length: 50 }, (_, g) => ({ path: `/f${g}`, items: items(99) }))
    const { rowEls } = mount(groups)
    expect(rowEls()).toHaveLength(5000)
    act(() => rowEls()[0].focus())
    renders.clear()

    key(rowEls()[0], 'ArrowDown')
    key(rowEls()[1], 'ArrowDown')

    expect(document.activeElement).toBe(rowEls()[2])
    expect([...renders.keys()].sort()).toEqual(['g:/f0', 'i:/f0:0', 'i:/f0:1'])
    expect(rowEls().filter((el) => el.tabIndex === 0)).toEqual([rowEls()[2]])
  })

  it('click/Enter on a row activate it; row control keys do not navigate and `row-actions` does not activate', () => {
    const { rowEls, onActivate } = mount([{ path: '/a', items: items(2) }])
    act(() => rowEls()[1].click())
    expect(onActivate).toHaveBeenLastCalledWith('item 0')
    key(rowEls()[2], 'Enter')
    expect(onActivate).toHaveBeenLastCalledWith('item 1')

    const button = rowEls()[1].querySelector('button')!
    act(() => button.focus())
    key(button, 'ArrowDown')
    key(button, 'Enter')
    expect(document.activeElement).toBe(button)
    expect(onActivate).toHaveBeenCalledTimes(2)

    act(() => rowEls()[1].querySelector<HTMLElement>('.row-actions button')!.click())
    expect(onActivate).toHaveBeenCalledTimes(2)
  })

  it('← on an item goes back to the group, ← on the group collapses and → expands', () => {
    const { rowEls } = mount([{ path: '/a', items: items(3) }])
    act(() => rowEls()[3].focus())
    key(rowEls()[3], 'ArrowLeft')
    expect(document.activeElement).toBe(rowEls()[0])
    key(rowEls()[0], 'ArrowLeft')
    expect(rowEls()).toHaveLength(1)
    key(rowEls()[0], 'ArrowRight')
    expect(rowEls()).toHaveLength(4)
  })

  it('when the focused row disappears, focus goes to the next remaining row (or the previous if last)', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)
    const render = (groups: TreeGroup<string>[]) =>
      act(() => root.render(<Tree groups={groups} onActivate={vi.fn()} keyed />))
    const rowEls = () => [...host.querySelectorAll<HTMLElement>('[data-row]')]
    const focused = () => document.activeElement?.textContent?.replace(/action|replace/g, '')

    render([{ path: '/a', items: ['a', 'b', 'c'] }])
    // Focus on a row control (e.g. "Adicionar ao stage"), which disappears with it.
    act(() => rowEls()[2].querySelector<HTMLElement>('.row-actions button')!.focus())
    render([{ path: '/a', items: ['a', 'c'] }])
    expect(focused()).toBe('c')
    expect(rowEls()[2].tabIndex).toBe(0)

    render([{ path: '/a', items: ['a'] }])
    expect(focused()).toBe('a')
  })

  it('does not take focus from outside the list when the row that had focus disappears', () => {
    const host = document.createElement('div')
    const outside = document.createElement('input')
    document.body.append(host, outside)
    const root = createRoot(host)
    roots.push(root)
    const render = (groups: TreeGroup<string>[]) =>
      act(() => root.render(<Tree groups={groups} onActivate={vi.fn()} keyed />))
    const rowEls = () => [...host.querySelectorAll<HTMLElement>('[data-row]')]

    render([{ path: '/a', items: ['a', 'b'] }])
    act(() => rowEls()[2].focus())
    act(() => outside.focus())
    render([{ path: '/a', items: ['a'] }])
    expect(document.activeElement).toBe(outside)
  })
})
