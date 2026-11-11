import { beforeEach, describe, expect, it } from 'vitest'
import { installFakeApi } from './test/fakeApi'

installFakeApi()

const { useStore } = await import('./store')
const { requestOnce, takeRequest } = await import('./requests')

beforeEach(() => useStore.setState({ requests: {} }))

describe('requestOnce', () => {
  it('stores the request with the payload and a new seq on each call', () => {
    requestOnce('explorerReveal', { path: '/a' })
    const first = useStore.getState().requests.explorerReveal
    expect(first?.payload).toEqual({ path: '/a' })

    requestOnce('explorerReveal', { path: '/a' })
    const second = useStore.getState().requests.explorerReveal
    expect(second?.seq).toBeGreaterThan(first!.seq)
  })

  it('requests without payload and of different types coexist', () => {
    requestOnce('searchFocus')
    requestOnce('groupFocus', { groupId: 'g' })
    const { requests } = useStore.getState()
    expect(requests.searchFocus).toBeDefined()
    expect(requests.groupFocus?.payload).toEqual({ groupId: 'g' })
  })

  it('a new request of the same type replaces the pending one', () => {
    requestOnce('historyReveal', { hash: 'a' })
    requestOnce('historyReveal', { hash: 'b' })
    expect(useStore.getState().requests.historyReveal?.payload).toEqual({ hash: 'b' })
  })
})

describe('takeRequest', () => {
  it('removes only the handled request', () => {
    requestOnce('searchFocus')
    requestOnce('commitFocus')
    takeRequest('searchFocus', useStore.getState().requests.searchFocus!.seq)
    const { requests } = useStore.getState()
    expect(requests.searchFocus).toBeUndefined()
    expect(requests.commitFocus).toBeDefined()
  })

  it('does not remove a request newer than the handled one', () => {
    requestOnce('explorerReveal', { path: '/a' })
    const old = useStore.getState().requests.explorerReveal!.seq
    requestOnce('explorerReveal', { path: '/b' })
    takeRequest('explorerReveal', old)
    expect(useStore.getState().requests.explorerReveal?.payload).toEqual({ path: '/b' })
  })

  it('handling a request that no longer exists is harmless', () => {
    takeRequest('searchFocus', 123)
    expect(useStore.getState().requests).toEqual({})
  })
})
