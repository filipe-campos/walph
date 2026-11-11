import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { useAsync, type AsyncOptions, type AsyncState } from './useAsync'

let root: Root | null = null
const host = document.createElement('div')

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  vi.useRealTimers()
})

type Deferred<T> = { promise: Promise<T>; resolve(v: T): void; reject(e: unknown): void }

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function Probe({
  fn,
  dep,
  options,
  onState
}: {
  fn: () => Promise<string>
  dep: string
  options?: AsyncOptions
  onState: (state: AsyncState<string>) => void
}) {
  const state = useAsync(fn, [dep], options)
  useEffect(() => {
    onState(state)
  })
  return null
}

function mount(node: React.JSX.Element): void {
  root = createRoot(host)
  act(() => root!.render(node))
}

function rerender(node: React.JSX.Element): void {
  act(() => root!.render(node))
}

const settle = (): Promise<void> => act(async () => {})

describe('useAsync', () => {
  it('loads and delivers the value', async () => {
    const out = { current: null as AsyncState<string> | null }
    const d = deferred<string>()
    mount(<Probe fn={() => d.promise} dep="a" onState={(s) => void (out.current = s)} />)
    expect(out.current).toMatchObject({ status: 'loading', value: undefined })
    d.resolve('ok')
    await settle()
    expect(out.current).toMatchObject({ status: 'success', value: 'ok' })
  })

  it('delivers the failure and calls onError once', async () => {
    const out = { current: null as AsyncState<string> | null }
    const onError = vi.fn()
    const boom = new Error('failed')
    mount(
      <Probe fn={() => Promise.reject(boom)} dep="a" options={{ onError }} onState={(s) => void (out.current = s)} />
    )
    await settle()
    expect(out.current).toMatchObject({ status: 'error', error: boom, value: undefined })
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(boom)
  })

  it('drops the response of old deps and never shows it', async () => {
    const out = { current: null as AsyncState<string> | null }
    const onError = vi.fn()
    const first = deferred<string>()
    const second = deferred<string>()
    mount(<Probe fn={() => first.promise} dep="a" options={{ onError }} onState={(s) => void (out.current = s)} />)
    rerender(<Probe fn={() => second.promise} dep="b" options={{ onError }} onState={(s) => void (out.current = s)} />)
    expect(out.current?.status).toBe('loading')
    first.reject(new Error('old'))
    await settle()
    expect(out.current?.status).toBe('loading')
    expect(onError).not.toHaveBeenCalled()
    second.resolve('nova')
    await settle()
    expect(out.current).toMatchObject({ status: 'success', value: 'nova' })
  })

  it('does not show the value of old deps while the new load is pending', async () => {
    const out = { current: null as AsyncState<string> | null }
    const second = deferred<string>()
    mount(<Probe fn={() => Promise.resolve('a')} dep="a" onState={(s) => void (out.current = s)} />)
    await settle()
    expect(out.current?.value).toBe('a')
    rerender(<Probe fn={() => second.promise} dep="b" onState={(s) => void (out.current = s)} />)
    expect(out.current).toMatchObject({ status: 'loading', value: undefined })
  })

  it('reload redoes the load with the same deps', async () => {
    const out = { current: null as AsyncState<string> | null }
    let n = 0
    const fn = vi.fn(() => Promise.resolve(`v${++n}`))
    mount(<Probe fn={fn} dep="a" onState={(s) => void (out.current = s)} />)
    await settle()
    expect(out.current?.value).toBe('v1')
    act(() => out.current!.reload())
    expect(out.current?.status).toBe('loading')
    await settle()
    expect(out.current).toMatchObject({ status: 'success', value: 'v2' })
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('ignores the response after unmount', async () => {
    const out = { current: null as AsyncState<string> | null }
    const onError = vi.fn()
    const d = deferred<string>()
    mount(<Probe fn={() => d.promise} dep="a" options={{ onError }} onState={(s) => void (out.current = s)} />)
    act(() => root!.unmount())
    root = null
    d.reject(new Error('late'))
    await settle()
    expect(onError).not.toHaveBeenCalled()
  })

  it('enabled=false does not load, and the result of the same deps is not repeated on re-enabling', async () => {
    const out = { current: null as AsyncState<string> | null }
    const fn = vi.fn(() => Promise.resolve('x'))
    mount(<Probe fn={fn} dep="a" options={{ enabled: false }} onState={(s) => void (out.current = s)} />)
    expect(out.current?.status).toBe('idle')
    expect(fn).not.toHaveBeenCalled()
    rerender(<Probe fn={fn} dep="a" onState={(s) => void (out.current = s)} />)
    await settle()
    expect(out.current).toMatchObject({ status: 'success', value: 'x' })
    rerender(<Probe fn={fn} dep="a" options={{ enabled: false }} onState={(s) => void (out.current = s)} />)
    rerender(<Probe fn={fn} dep="a" onState={(s) => void (out.current = s)} />)
    await settle()
    expect(fn).toHaveBeenCalledTimes(1)
    expect(out.current?.value).toBe('x')
  })

  it('delayMs waits for the last deps change', async () => {
    vi.useFakeTimers()
    const out = { current: null as AsyncState<string> | null }
    const fn = vi.fn(() => Promise.resolve('ok'))
    mount(<Probe fn={fn} dep="a" options={{ delayMs: 100 }} onState={(s) => void (out.current = s)} />)
    rerender(<Probe fn={fn} dep="ab" options={{ delayMs: 100 }} onState={(s) => void (out.current = s)} />)
    await act(async () => {
      vi.advanceTimersByTime(99)
    })
    expect(fn).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(out.current).toMatchObject({ status: 'success', value: 'ok' })
  })

  it('keepPrevious keeps the last non-null value while loading', async () => {
    const out = { current: null as AsyncState<string> | null }
    const second = deferred<string>()
    const options = { keepPrevious: true }
    mount(<Probe fn={() => Promise.resolve('a')} dep="a" options={options} onState={(s) => void (out.current = s)} />)
    await settle()
    rerender(<Probe fn={() => second.promise} dep="b" options={options} onState={(s) => void (out.current = s)} />)
    expect(out.current).toMatchObject({ status: 'loading', value: 'a' })
  })
})
