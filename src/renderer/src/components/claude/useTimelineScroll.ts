import { useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react'
import type { ClaudeConversation } from '../../lib/claudeConversation'
import type { TimelineItem } from '../../lib/claudeTimeline'
import { useStore } from '../../store'

const STICK_THRESHOLD = 48

/** Scroll of each conversation: the Timeline only exists while the tab is visible, so it is restored on return. */
// Stores an anchor (first visible item + offset) and not the scrollTop: with `content-visibility` the heights of the
// items not yet seen are estimates, and the saved pixel would land on another message.
const scrollMemory = new Map<string, { anchor: { key: string; offset: number } | null; stick: boolean }>()

/**
 * Child of the list that shows item `index`. The pinned message strip is the only child that is not an item and comes
 * right before it (`pinnedAt`): without building an array of children on every scroll.
 */
function itemChild(list: HTMLElement, index: number, pinnedAt: number): HTMLElement | undefined {
  return list.children[pinnedAt >= 0 && index >= pinnedAt ? index + 1 : index] as HTMLElement | undefined
}

/** Position of the item in the flow (the pinned message stays in the flow; only the `sticky` strip before it moves). */
function flowTop(list: HTMLElement, index: number, pinnedAt: number): number | null {
  const child = itemChild(list, index, pinnedAt)
  return child ? topOf(list, child) : null
}

function topOf(list: HTMLElement, child: HTMLElement): number {
  return child.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop
}

/** First item still showing at the top (binary search: positions grow with the index). */
function firstVisible(list: HTMLElement, count: number, pinnedAt: number): number {
  let lo = 0
  let hi = count - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const child = itemChild(list, mid, pinnedAt)
    const top = flowTop(list, mid, pinnedAt)
    if (!child || top === null) hi = mid - 1
    else if (top + child.offsetHeight > list.scrollTop) {
      found = mid
      hi = mid - 1
    } else lo = mid + 1
  }
  return found
}

interface TimelineScrollInput {
  conversationId: string
  items: readonly TimelineItem[]
  /** Index of the pinned message (the last user one), or -1. */
  lastUserIndex: number
  streaming: ClaudeConversation['streaming']
  permissions: ClaudeConversation['permissions']
  queued: ClaudeConversation['queued']
  background: ClaudeConversation['background']
  busy: boolean
  active: boolean
}

/** Anchor, "stick to the end" and ResizeObserver of the conversation list. */
export function useTimelineScroll({
  conversationId,
  items,
  lastUserIndex,
  streaming,
  permissions,
  queued,
  background,
  busy,
  active
}: TimelineScrollInput): { scrollRef: React.RefObject<HTMLDivElement | null>; onScroll: () => void } {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stick = useRef(scrollMemory.get(conversationId)?.stick ?? true)

  // Updated only by the user (scrolling); content growth does not change the "stuck" end.
  const onScroll = (): void => {
    const el = scrollRef.current
    if (!el) return
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD
    // The anchor only matters away from the end (stuck at the end the list goes back to the end): and then the search
    // is O(log n).
    let anchor: { key: string; offset: number } | null = null
    if (!stick.current) {
      const at = firstVisible(el, items.length, lastUserIndex)
      const child = at >= 0 ? itemChild(el, at, lastUserIndex) : undefined
      const top = flowTop(el, at, lastUserIndex)
      const key = items[at]?.key
      if (child && top !== null && key !== undefined) anchor = { key, offset: el.scrollTop - top }
    }
    scrollMemory.set(conversationId, { anchor, stick: stick.current })
  }

  // Goes back to where the user was reading (without this the remounted list would go to the end).
  const restoreScroll = useEffectEvent(() => {
    const saved = scrollMemory.get(conversationId)
    const el = scrollRef.current
    if (el && saved && !saved.stick && saved.anchor) {
      const index = items.findIndex((i) => i.key === saved.anchor!.key)
      const child = index >= 0 ? itemChild(el, index, lastUserIndex) : undefined
      const top = child ? flowTop(el, index, lastUserIndex) : null
      if (top !== null) el.scrollTop = top + saved.anchor.offset
    }
    // Closed conversations leave no anchor behind.
    const open = new Set(useStore.getState().claude.conversations.map((c) => c.id))
    for (const id of scrollMemory.keys()) if (!open.has(id)) scrollMemory.delete(id)
  })
  useLayoutEffect(() => restoreScroll(), [conversationId])

  const toBottom = (): void => {
    const el = scrollRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }

  useLayoutEffect(() => {
    toBottom()
    // `active`: the hidden panel has no height; on appearing it goes back to the end.
  }, [items, streaming, permissions, queued, busy, active, background])

  // Content grows without passing through here (markdown that finishes loading, a card that expands, an image, the
  // prompt box changing the list height): whoever grows notifies via ResizeObserver and, stuck at the end, the list
  // follows.
  const observer = useRef<ResizeObserver | null>(null)
  const observed = useRef(new Set<Element>())
  // No dependency list on purpose: on every render, the new children enter the observer (the already seen ones stay).
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    if (!observer.current) {
      observer.current = new ResizeObserver(toBottom)
      // The list itself: its height changes when the prompt box grows.
      observer.current.observe(el)
    }
    const current = new Set<Element>(el.children)
    for (const child of current)
      if (!observed.current.has(child)) {
        observed.current.add(child)
        observer.current.observe(child)
      }
    // Children that left the list stop being observed (otherwise the observer holds them).
    for (const old of observed.current)
      if (!current.has(old)) {
        observed.current.delete(old)
        observer.current.unobserve(old)
      }
  })
  useEffect(
    () => () => {
      observer.current?.disconnect()
      observer.current = null
    },
    []
  )

  return { scrollRef, onScroll }
}
