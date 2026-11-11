import { act, useState } from 'react'
import { mount } from './dom'

export interface HookHandle<P, R> {
  /** Last value returned by the hook. */
  readonly current: R
  rerender(props: P): void
}

/** Runs the hook in a component mounted with `mount` (`unmountAll()` in `afterEach` unmounts it). */
export function renderHook<P, R>(hook: (props: P) => R, initial: P): HookHandle<P, R> {
  const handle = { current: undefined as R }
  let setProps: (props: P) => void = () => {}
  function Probe(): null {
    const [props, set] = useState(initial)
    setProps = (next) => set(() => next)
    handle.current = hook(props)
    return null
  }
  mount(<Probe />)
  return {
    get current() {
      return handle.current
    },
    rerender: (props) => act(() => setProps(props))
  }
}
