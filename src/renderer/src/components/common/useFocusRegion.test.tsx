import { createRef } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

const { hasFocus } = await import('../../focusBridge')
const { useFocusRegion } = await import('./useFocusRegion')

let root: Root | null = null
const host = document.createElement('div')

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
})

function Probe({ intoRef }: { intoRef: React.RefObject<HTMLDivElement | null> }): React.JSX.Element {
  return <div tabIndex={0} ref={useFocusRegion('tree', { intoRef })} />
}

describe('useFocusRegion', () => {
  it('with intoRef, passes the element on mount and clears the ref on unmount', () => {
    const intoRef = createRef<HTMLDivElement | null>()
    root = createRoot(host)
    act(() => root!.render(<Probe intoRef={intoRef} />))
    expect(intoRef.current).toBeInstanceOf(HTMLDivElement)
    act(() => root!.render(<div />))
    expect(intoRef.current).toBeNull()
  })

  it('removes the region registration on unmount', () => {
    const intoRef = createRef<HTMLDivElement | null>()
    root = createRoot(host)
    document.body.append(host)
    act(() => root!.render(<Probe intoRef={intoRef} />))
    intoRef.current?.focus()
    expect(hasFocus('tree')).toBe(true)
    act(() => root!.render(<div />))
    expect(hasFocus('tree')).toBe(false)
    host.remove()
  })
})
