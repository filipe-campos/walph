import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNow } from './useNow'

let root: Root | null = null
const host = document.createElement('div')
const seen = (): number => Number(host.textContent)

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => {
  vi.useFakeTimers({ now: 1000 })
})
afterEach(() => {
  act(() => root?.unmount())
  root = null
  vi.useRealTimers()
})

function Probe({ enabled }: { enabled: boolean }): React.JSX.Element {
  return <span>{useNow(1000, enabled)}</span>
}

describe('useNow', () => {
  it('advances every interval while enabled', () => {
    root = createRoot(host)
    act(() => root!.render(<Probe enabled />))
    expect(seen()).toBe(1000)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(seen()).toBe(3000)
  })

  it('stopped, keeps the last value and resumes when enabled', () => {
    root = createRoot(host)
    act(() => root!.render(<Probe enabled={false} />))
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(seen()).toBe(1000)
    act(() => root!.render(<Probe enabled />))
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(seen()).toBe(7000)
  })
})
