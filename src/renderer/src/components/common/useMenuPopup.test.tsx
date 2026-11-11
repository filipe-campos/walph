import { act, useEffect, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { click, mount, press, unmountAll } from '../../test/dom'
import { useMenuPopup } from './useMenuPopup'

type Popup = ReturnType<typeof useMenuPopup>

interface Props {
  returnFocus?: () => void
  onArrow?: (dir: 1 | -1) => void
  items?: string[]
  checked?: string
  field?: boolean
  disabled?: string
  onPopup?: (popup: Popup) => void
}

function Menu({ returnFocus = () => {}, onArrow, items = ['a', 'b', 'c'], checked, field, disabled, onPopup }: Props) {
  const m = useMenuPopup({ returnFocus, onArrow })
  const { open, rootRef, menuRef, menuId, toggle, onMenuKeyDown } = m
  useEffect(() => {
    onPopup?.(m)
  })
  return (
    <section ref={rootRef}>
      <button id="trigger" onClick={toggle} />
      {open && (
        <div ref={menuRef} id={menuId} onKeyDown={onMenuKeyDown}>
          {field && <input id="search" data-autofocus />}
          {items.map((id) => (
            <button key={id} id={id} data-nav aria-checked={checked === id} disabled={disabled === id} />
          ))}
        </div>
      )}
    </section>
  )
}

const active = (): string => document.activeElement?.id ?? ''
const pointerDown = (target: Element): void => {
  act(() => {
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  })
}

function open(props: Props = {}): { popup: { current: Popup | null } } {
  const popup = { current: null as Popup | null }
  mount(<Menu {...props} onPopup={(p) => (popup.current = p)} />)
  click(document.getElementById('trigger')!)
  return { popup }
}

afterEach(() => {
  unmountAll()
})

describe('opening and focusing', () => {
  it('opens on click with focus on the first item', () => {
    open()
    expect(active()).toBe('a')
  })

  it('the item marked with aria-checked gets focus', () => {
    open({ checked: 'b' })
    expect(active()).toBe('b')
  })

  it('skipping disabled items on open', () => {
    open({ disabled: 'a' })
    expect(active()).toBe('b')
  })

  it('openAt("last") opens on the last item', () => {
    const popup = { current: null as Popup | null }
    mount(<Menu onPopup={(p) => (popup.current = p)} />)
    act(() => popup.current!.openAt('last'))
    expect(active()).toBe('c')
  })

  it('openAt("first") opens on the first', () => {
    const popup = { current: null as Popup | null }
    mount(<Menu onPopup={(p) => (popup.current = p)} />)
    act(() => popup.current!.openAt('first'))
    expect(active()).toBe('a')
  })

  it('a field with data-autofocus gets focus instead of the items', () => {
    open({ field: true })
    expect(active()).toBe('search')
  })

  it('clicking the trigger again closes', () => {
    const { popup } = open()
    click(document.getElementById('trigger')!)
    expect(popup.current!.open).toBe(false)
    expect(document.getElementById('a')).toBeNull()
  })

  it('the trigger after an openAt("last") opens on the first again', () => {
    const { popup } = open()
    act(() => popup.current!.openAt('last'))
    click(document.getElementById('trigger')!)
    click(document.getElementById('trigger')!)
    expect(active()).toBe('a')
  })
})

describe('keyboard in the menu', () => {
  it('↓ and ↑ go through the items, wrapping at the ends', () => {
    open()
    expect(press(document.activeElement!, 'ArrowDown')).toBe(true)
    expect(active()).toBe('b')
    press(document.activeElement!, 'ArrowDown')
    press(document.activeElement!, 'ArrowDown')
    expect(active()).toBe('a')
    press(document.activeElement!, 'ArrowUp')
    expect(active()).toBe('c')
  })

  it('disabled ones are skipped', () => {
    open({ disabled: 'b' })
    press(document.activeElement!, 'ArrowDown')
    expect(active()).toBe('c')
  })

  it('Home and End go to the ends', () => {
    open({ checked: 'b' })
    press(document.activeElement!, 'End')
    expect(active()).toBe('c')
    press(document.activeElement!, 'Home')
    expect(active()).toBe('a')
  })

  it('↑ with focus outside the items (search field) goes to the last', () => {
    open({ field: true })
    press(document.activeElement!, 'ArrowUp')
    expect(active()).toBe('c')
  })

  it('↓ in the search field goes to the first item', () => {
    open({ field: true })
    press(document.activeElement!, 'ArrowDown')
    expect(active()).toBe('a')
  })

  it('Esc returns focus, closes and does not reach the ancestor', () => {
    const returnFocus = vi.fn()
    const parent = vi.fn()
    const { popup } = open({ returnFocus })
    document.body.addEventListener('keydown', parent)
    const prevented = press(document.activeElement!, 'Escape')
    expect(prevented).toBe(true)
    expect(returnFocus).toHaveBeenCalledTimes(1)
    expect(popup.current!.open).toBe(false)
    expect(parent).not.toHaveBeenCalled()
    document.body.removeEventListener('keydown', parent)
  })

  it('Tab closes without returning focus', () => {
    const returnFocus = vi.fn()
    const { popup } = open({ returnFocus })
    press(document.activeElement!, 'Tab')
    expect(popup.current!.open).toBe(false)
    expect(returnFocus).not.toHaveBeenCalled()
  })

  it('other keys pass through without effect', () => {
    const { popup } = open()
    expect(press(document.activeElement!, 'x')).toBe(false)
    expect(popup.current!.open).toBe(true)
    expect(active()).toBe('a')
  })
})

describe('side arrows (onArrow)', () => {
  it('→ and ← call onArrow and consume the key', () => {
    const onArrow = vi.fn()
    open({ onArrow })
    expect(press(document.activeElement!, 'ArrowRight')).toBe(true)
    press(document.activeElement!, 'ArrowLeft')
    expect(onArrow.mock.calls).toEqual([[1], [-1]])
  })

  it('without onArrow the side arrows pass through', () => {
    open()
    expect(press(document.activeElement!, 'ArrowRight')).toBe(false)
  })

  it('in a field with text, Home/End/←/→ belong to the field cursor', () => {
    const onArrow = vi.fn()
    open({ field: true, onArrow })
    const input = document.getElementById('search') as HTMLInputElement
    input.value = 'abc'
    for (const key of ['Home', 'End', 'ArrowLeft', 'ArrowRight']) expect(press(input, key)).toBe(false)
    expect(onArrow).not.toHaveBeenCalled()
    expect(active()).toBe('search')
  })

  it('in an empty field ←/→ go to onArrow, but Home/End stay with the field', () => {
    const onArrow = vi.fn()
    open({ field: true, onArrow })
    const input = document.getElementById('search')!
    expect(press(input, 'ArrowRight')).toBe(true)
    expect(onArrow).toHaveBeenCalledWith(1)
    expect(press(input, 'Home')).toBe(false)
    expect(active()).toBe('search')
  })

  it('↑ and ↓ keep navigating even in a field with text', () => {
    open({ field: true })
    const input = document.getElementById('search') as HTMLInputElement
    input.value = 'abc'
    press(input, 'ArrowDown')
    expect(active()).toBe('a')
  })
})

describe('outside click', () => {
  it('outside the menu closes and, if focus was inside, returns focus', () => {
    const returnFocus = vi.fn()
    const outside = document.body.appendChild(document.createElement('div'))
    const { popup } = open({ returnFocus })
    pointerDown(outside)
    expect(popup.current!.open).toBe(false)
    expect(returnFocus).toHaveBeenCalledTimes(1)
    outside.remove()
  })

  it('outside the menu with focus already elsewhere closes without returning focus', () => {
    const returnFocus = vi.fn()
    const outside = document.body.appendChild(document.createElement('button'))
    const { popup } = open({ returnFocus })
    outside.focus()
    pointerDown(outside)
    expect(popup.current!.open).toBe(false)
    expect(returnFocus).not.toHaveBeenCalled()
    outside.remove()
  })

  it('inside the component (menu or trigger) does not close', () => {
    const { popup } = open()
    pointerDown(document.getElementById('b')!)
    pointerDown(document.getElementById('trigger')!)
    expect(popup.current!.open).toBe(true)
  })

  it('after closing the listener leaves: an outside click does not call returnFocus', () => {
    const returnFocus = vi.fn()
    const { popup } = open({ returnFocus })
    act(() => popup.current!.close(false))
    pointerDown(document.body)
    expect(returnFocus).not.toHaveBeenCalled()
  })
})

describe('close and returnFocus', () => {
  it('close(true) returns focus and close(false) does not', () => {
    const returnFocus = vi.fn()
    const { popup } = open({ returnFocus })
    act(() => popup.current!.close(false))
    expect(returnFocus).not.toHaveBeenCalled()
    act(() => popup.current!.openAt('first'))
    act(() => popup.current!.close(true))
    expect(returnFocus).toHaveBeenCalledTimes(1)
  })

  it('uses the most recent returnFocus without resubscribing the outside click listener', () => {
    const first = vi.fn()
    const second = vi.fn()
    let setReturn: (fn: () => void) => void = () => {}
    function Switch() {
      const [fn, set] = useState<() => void>(() => first)
      useEffect(() => {
        setReturn = (next) => set(() => next)
      })
      return <Menu returnFocus={fn} />
    }
    mount(<Switch />)
    click(document.getElementById('trigger')!)
    const add = vi.spyOn(document, 'addEventListener')
    act(() => setReturn(second))
    expect(add).not.toHaveBeenCalledWith('pointerdown', expect.anything(), true)
    press(document.activeElement!, 'Escape')
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })
})

describe('lost focus', () => {
  it('the focused item leaves the DOM: focus returns to the first remaining item', () => {
    let setItems: (items: string[]) => void = () => {}
    function Wrapper() {
      const [items, set] = useState(['a', 'b'])
      useEffect(() => {
        setItems = set
      }, [set])
      return <Menu items={items} />
    }
    mount(<Wrapper />)
    click(document.getElementById('trigger')!)
    expect(active()).toBe('a')
    act(() => setItems(['b']))
    expect(active()).toBe('b')
  })
})
