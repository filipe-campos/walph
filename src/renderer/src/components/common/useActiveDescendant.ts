import { useEffect, useState } from 'react'
import { activeTarget, type ActiveIndexOptions } from '../../lib/activeIndex'

interface Options extends ActiveIndexOptions {
  count: number
  /** Changes when the list becomes another one (new query): the active option goes back to `initialIndex`. */
  resetKey?: string
  initialIndex?: number
  idOf: (index: number) => string
  /** List shown; when closed, nothing is announced or scrolled. */
  open?: boolean
}

interface KeyLike {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  preventDefault(): void
}

/**
 * Active option of a `listbox` whose focus stays on the field/button (`aria-activedescendant`): index, announced id,
 * scrolling to the option and the ↑/↓/PageUp/PageDown keys (Home/End with `homeEnd`). `onKeyDown` returns `true` if it
 * handled the key.
 */
export function useActiveDescendant({
  count,
  resetKey = '',
  initialIndex = 0,
  idOf,
  open = true,
  wrap,
  homeEnd,
  pageSize
}: Options) {
  const [state, setState] = useState({ key: '', index: initialIndex })
  const index = count > 0 ? Math.min(state.key === resetKey ? state.index : 0, count - 1) : 0
  const shown = open && count > 0

  const setIndex = (next: number): void => setState({ key: resetKey, index: next })

  const id = shown ? idOf(index) : undefined
  useEffect(() => {
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'nearest' })
  }, [id, count])

  const onKeyDown = (e: KeyLike): boolean => {
    if (!shown || e.ctrlKey || e.metaKey || e.altKey) return false
    const to = activeTarget(e.key, index, count, { wrap, homeEnd, pageSize })
    if (to === null) return false
    e.preventDefault()
    setIndex(to)
    return true
  }

  return { index, activeId: id, setIndex, onKeyDown }
}
