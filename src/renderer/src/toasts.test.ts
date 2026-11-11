import { beforeEach, describe, expect, it } from 'vitest'
import { installFakeApi } from './test/fakeApi'

// `store.ts` reads `window.api` on load: the stub must exist before the import.
installFakeApi()

const { useStore } = await import('./store')
const { notify, showToast, updateToastByKey, leaveToast, dismissToast, dismissToastByKey, dismissToastsWhere } =
  await import('./toasts')

const toasts = () => useStore.getState().toasts
const titles = () => toasts().map((t) => t.title)

beforeEach(() => useStore.setState({ toasts: [] }))

describe('showToast', () => {
  it('returns increasing ids and appends at the end', () => {
    const a = showToast({ tone: 'info', title: 'a' })
    const b = showToast({ tone: 'info', title: 'b' })
    expect(b).toBeGreaterThan(a)
    expect(titles()).toEqual(['a', 'b'])
  })

  it('same key with different content replaces in place, with a new id', () => {
    showToast({ tone: 'info', title: 'x' })
    const first = showToast({ tone: 'info', title: 'a', key: 'k' })
    showToast({ tone: 'info', title: 'y' })
    const second = showToast({ tone: 'attention', title: 'b', key: 'k' })
    expect(second).not.toBe(first)
    expect(titles()).toEqual(['x', 'b', 'y'])
    expect(toasts()[1]).toMatchObject({ id: second, tone: 'attention' })
  })

  it('same key and same content keeps the original toast (same id, same state reference)', () => {
    const first = showToast({ tone: 'done', title: 'a', description: 'd', key: 'k' })
    const before = useStore.getState().toasts
    const again = showToast({ tone: 'done', title: 'a', description: 'd', key: 'k', duration: 1 })
    expect(again).toBe(first)
    expect(useStore.getState().toasts).toBe(before)
  })

  it('same key and same content but the original is already leaving: replaces', () => {
    const first = showToast({ tone: 'done', title: 'a', key: 'k' })
    leaveToast(first)
    const again = showToast({ tone: 'done', title: 'a', key: 'k' })
    expect(again).not.toBe(first)
    expect(toasts()).toHaveLength(1)
    expect(toasts()[0].leaving).toBeUndefined()
  })

  it('above 5 drops the oldest done/info; attention and error never leave through the limit', () => {
    showToast({ tone: 'error', title: 'e1' })
    showToast({ tone: 'attention', title: 'w1' })
    showToast({ tone: 'info', title: 'i1' })
    showToast({ tone: 'done', title: 'd1' })
    showToast({ tone: 'info', title: 'i2' })
    showToast({ tone: 'info', title: 'i3' })
    expect(titles()).toEqual(['e1', 'w1', 'd1', 'i2', 'i3'])
    showToast({ tone: 'error', title: 'e2' })
    expect(titles()).toEqual(['e1', 'w1', 'i2', 'i3', 'e2'])
  })

  it('only attention/error above the limit: nothing is dropped', () => {
    for (let i = 0; i < 7; i++) showToast({ tone: i % 2 ? 'error' : 'attention', title: `t${i}` })
    expect(toasts()).toHaveLength(7)
  })

  it('the newly created toast (info) is never the one dropped by the limit', () => {
    for (let i = 0; i < 5; i++) showToast({ tone: 'error', title: `e${i}` })
    showToast({ tone: 'info', title: 'new' })
    expect(titles()).toContain('new')
  })
})

describe('updateToastByKey / leaveToast / dismissToast', () => {
  it('updates title, description and progress keeping the id', () => {
    const id = showToast({ tone: 'info', title: 'a', key: 'k', progress: null })
    updateToastByKey('k', { title: 'b', progress: 40 })
    expect(toasts()[0]).toMatchObject({ id, title: 'b', progress: 40 })
  })

  it('missing key does not touch the state', () => {
    showToast({ tone: 'info', title: 'a', key: 'k' })
    const before = useStore.getState().toasts
    updateToastByKey('other', { title: 'b' })
    expect(useStore.getState().toasts).toBe(before)
  })

  it('leaveToast marks the exit once; dismissToast removes', () => {
    const id = showToast({ tone: 'info', title: 'a' })
    leaveToast(id)
    expect(toasts()[0].leaving).toBe(true)
    const before = useStore.getState().toasts
    leaveToast(id)
    expect(useStore.getState().toasts).toBe(before)
    dismissToast(id)
    expect(toasts()).toEqual([])
    dismissToast(id)
    expect(toasts()).toEqual([])
  })
})

describe('dismissToastsWhere / dismissToastByKey', () => {
  it('removes only the toasts with a key that matches the filter', () => {
    showToast({ tone: 'info', title: 'no key' })
    showToast({ tone: 'info', title: 'a', key: 'claude:1:done' })
    showToast({ tone: 'info', title: 'b', key: 'claude:2:error' })
    showToast({ tone: 'info', title: 'c', key: 'git:clone' })
    dismissToastsWhere((k) => k.startsWith('claude:'))
    expect(titles()).toEqual(['no key', 'c'])
  })

  it('without a match keeps the state reference', () => {
    showToast({ tone: 'info', title: 'a' })
    const before = useStore.getState().toasts
    dismissToastsWhere(() => true)
    dismissToastByKey('nothing')
    expect(useStore.getState().toasts).toBe(before)
  })

  it('dismissToastByKey removes only the exact key', () => {
    showToast({ tone: 'info', title: 'a', key: 'k' })
    showToast({ tone: 'info', title: 'b', key: 'k2' })
    dismissToastByKey('k')
    expect(titles()).toEqual(['b'])
  })
})

describe('notify', () => {
  it('error lasts 8 s by default and info 4 s', () => {
    notify('failed')
    notify('ok', 'info')
    expect(toasts().map((t) => [t.tone, t.title, t.duration])).toEqual([
      ['error', 'failed', 8000],
      ['info', 'ok', 4000]
    ])
  })
})
