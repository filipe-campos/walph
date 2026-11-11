import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { installFakeApi } from '../../test/fakeApi'

installFakeApi()

const { useStore } = await import('../../store')
const { requestOnce } = await import('../../requests')
const { requestFocus } = await import('../../focusBridge')
const { useRequest } = await import('./useRequest')
const { useFocusTarget } = await import('./useFocusTarget')

let root: Root | null = null
const host = document.createElement('div')

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  useStore.setState({ requests: {} })
})

function mount(node: React.JSX.Element): void {
  root = createRoot(host)
  act(() => root!.render(node))
}

function Search({ onFocus }: { onFocus(): void }) {
  useRequest('searchFocus', onFocus)
  return null
}

function Group({ id, onFocus }: { id: string; onFocus(): void }) {
  useRequest('groupFocus', onFocus, (p) => p.groupId === id)
  return null
}

describe('useRequest', () => {
  it('serves the request made before mount only once and removes it from the store', () => {
    requestOnce('searchFocus')
    const onFocus = vi.fn()
    mount(<Search onFocus={onFocus} />)
    expect(onFocus).toHaveBeenCalledTimes(1)
    expect(useStore.getState().requests.searchFocus).toBeUndefined()

    act(() => root!.unmount())
    mount(<Search onFocus={onFocus} />)
    expect(onFocus).toHaveBeenCalledTimes(1)
  })

  it('serves requests made with the view already mounted, one per request', () => {
    const onFocus = vi.fn()
    mount(<Search onFocus={onFocus} />)
    act(() => requestOnce('searchFocus'))
    act(() => requestOnce('searchFocus'))
    expect(onFocus).toHaveBeenCalledTimes(2)
  })

  it('only serves requests that match accepts and leaves the others pending', () => {
    const onFocus = vi.fn()
    mount(<Group id="g1" onFocus={onFocus} />)
    act(() => requestOnce('groupFocus', { groupId: 'g2' }))
    expect(onFocus).not.toHaveBeenCalled()
    expect(useStore.getState().requests.groupFocus).toBeDefined()

    act(() => requestOnce('groupFocus', { groupId: 'g1' }))
    expect(onFocus).toHaveBeenCalledWith({ groupId: 'g1' })
    expect(useStore.getState().requests.groupFocus).toBeUndefined()
  })
})

describe('useFocusTarget', () => {
  it('raises the counter on every requestFocus and stops after unmount', () => {
    const seen: number[] = []
    function Target() {
      seen.push(useFocusTarget('terminal'))
      return null
    }
    mount(<Target />)
    act(() => void requestFocus('terminal'))
    act(() => void requestFocus('terminal'))
    expect(seen.at(-1)).toBe(2)

    act(() => root!.unmount())
    expect(requestFocus('terminal')).toBe(false)
  })
})
