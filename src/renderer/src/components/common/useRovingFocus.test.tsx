import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { useRovingFocus } from './useRovingFocus'

let root: Root | null = null
const host = document.createElement('div')

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  document.body.append(host)
})
afterEach(() => {
  act(() => root?.unmount())
  root = null
})

function List({ orientation }: { orientation: 'horizontal' | 'vertical' }): React.JSX.Element {
  const onKeyDown = useRovingFocus({ orientation, selector: 'button' })
  return (
    <div onKeyDown={onKeyDown}>
      <button id="a" />
      <button id="b" disabled />
      <button id="c" />
    </div>
  )
}

function press(el: Element, key: string): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  act(() => {
    el.dispatchEvent(event)
  })
  return event.defaultPrevented
}

function mount(orientation: 'horizontal' | 'vertical'): void {
  root = createRoot(host)
  act(() => root!.render(<List orientation={orientation} />))
  document.getElementById('a')!.focus()
}

describe('useRovingFocus', () => {
  it('vertical: vertical arrows move focus, skip disabled ones and wrap', () => {
    mount('vertical')
    expect(press(document.activeElement!, 'ArrowDown')).toBe(true)
    expect(document.activeElement?.id).toBe('c')
    press(document.activeElement!, 'ArrowDown')
    expect(document.activeElement?.id).toBe('a')
    press(document.activeElement!, 'End')
    expect(document.activeElement?.id).toBe('c')
    press(document.activeElement!, 'Home')
    expect(document.activeElement?.id).toBe('a')
  })

  it('vertical ignores the horizontal arrows; horizontal ignores the vertical ones', () => {
    mount('vertical')
    expect(press(document.activeElement!, 'ArrowRight')).toBe(false)
    expect(document.activeElement?.id).toBe('a')
    act(() => root!.render(<List orientation="horizontal" />))
    expect(press(document.activeElement!, 'ArrowDown')).toBe(false)
    press(document.activeElement!, 'ArrowRight')
    expect(document.activeElement?.id).toBe('c')
  })
})
