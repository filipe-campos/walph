import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as DocumentStore from './components/editor/documentStore'
import { installFakeApi } from './test/fakeApi'
import { fileTab } from './test/tabFixtures'

const { forgetDocument } = vi.hoisted(() => ({ forgetDocument: vi.fn<(id: string) => void>() }))
const setDirty = vi.fn<(dirty: boolean) => void>()

// `saveActions.ts` and others read `window.api` on load: the stub must exist before the import.
installFakeApi({
  window: { setDirty: (dirty) => setDirty(dirty) },
  session: { save: () => undefined }
})

vi.mock('./components/editor/documentStore', async (importOriginal) => ({
  ...(await importOriginal<typeof DocumentStore>()),
  forgetDocument: (id: string) => forgetDocument(id)
}))

const { useStore, onRootChange } = await import('./store')
const { startStoreReactions } = await import('./storeReactions')
const { markFormatDirty, formatDirtyEol, isDiskReadCurrent, beginDiskRead } = await import('./diskSync')

let stops: Array<() => void> = []
const start = (): (() => void) => {
  const stop = startStoreReactions()
  stops.push(stop)
  return stop
}

beforeEach(() => {
  forgetDocument.mockReset()
  setDirty.mockReset()
  useStore.setState({ tabs: [], activeTabId: null, root: null, references: null })
})

afterEach(() => {
  for (const stop of stops) stop()
  stops = []
})

describe('startStoreReactions', () => {
  it('a nested set from an earlier listener does not make an open tab look closed', () => {
    const off = useStore.subscribe(
      (s) => s.tabs,
      (tabs) => {
        if (tabs.length === 1 && tabs[0].id === 'b')
          useStore.setState({ tabs: [...tabs, fileTab({ id: 'n', dirty: true })] })
      }
    )
    start()
    useStore.setState({ tabs: [fileTab({ id: 'a' }), fileTab({ id: 'b' })] })
    forgetDocument.mockReset()

    useStore.setState({ tabs: [fileTab({ id: 'b' })] })

    expect(useStore.getState().tabs.map((t) => t.id)).toEqual(['b', 'n'])
    expect(forgetDocument.mock.calls).toEqual([['a']])
    off()
  })

  it('closing a tab forgets the document and prunes the per-tab maps', () => {
    start()
    useStore.setState({ tabs: [fileTab({ id: 'a' }), fileTab({ id: 'b' })] })
    markFormatDirty('a', 'LF')
    markFormatDirty('b', 'LF')
    const tokenA = beginDiskRead('a')
    const tokenB = beginDiskRead('b')

    useStore.setState({ tabs: [fileTab({ id: 'b' })] })

    expect(forgetDocument).toHaveBeenCalledTimes(1)
    expect(forgetDocument).toHaveBeenCalledWith('a')
    expect(formatDirtyEol('a')).toBeUndefined()
    expect(formatDirtyEol('b')).toBe('LF')
    expect(isDiskReadCurrent('a', tokenA)).toBe(false)
    expect(isDiskReadCurrent('b', tokenB)).toBe(true)
  })

  it('switching folders calls the onRootChange listeners in registration order', () => {
    start()
    const calls: string[] = []
    const offs = [onRootChange(() => calls.push('a')), onRootChange(() => calls.push('b'))]

    useStore.setState({ root: '/new' })

    expect(calls).toEqual(['a', 'b'])
    offs.forEach((off) => off())
  })

  it('stop() removes the subscriptions', () => {
    const stop = start()
    stop()
    useStore.setState({ tabs: [fileTab({ id: 'a', dirty: true })] })
    useStore.setState({ tabs: [] })
    useStore.setState({ references: { title: 't', items: [] } })
    useStore.setState({ root: '/new' })

    expect(forgetDocument).not.toHaveBeenCalled()
    expect(setDirty).not.toHaveBeenCalled()
    expect(useStore.getState().references).not.toBeNull()
  })

  it('stop() is idempotent and an old stop does not undo the new instance', () => {
    const first = start()
    const second = start()
    first()
    first()
    useStore.setState({ tabs: [fileTab({ id: 'a', dirty: true })] })
    expect(setDirty).toHaveBeenCalledWith(true)
    useStore.setState({ tabs: [] })
    expect(forgetDocument).toHaveBeenCalledWith('a')
    second()
  })

  it('calling twice does not duplicate the effects', () => {
    start()
    start()
    useStore.setState({ tabs: [fileTab({ id: 'a', dirty: true })] })
    useStore.setState({ tabs: [] })

    expect(forgetDocument).toHaveBeenCalledTimes(1)
    expect(setDirty).toHaveBeenCalledTimes(2)
  })

  it('tells main the dirty state only when it changes', () => {
    start()
    useStore.setState({ tabs: [fileTab({ id: 'a', dirty: true })] })
    useStore.setState({ tabs: [fileTab({ id: 'a', dirty: true }), fileTab({ id: 'b' })] })
    useStore.setState({ cursor: { line: 1, column: 1, selected: 0 } })
    expect(setDirty.mock.calls).toEqual([[true]])

    useStore.setState({ tabs: [fileTab({ id: 'a' }), fileTab({ id: 'b' })] })
    expect(setDirty.mock.calls).toEqual([[true], [false]])
  })
})
