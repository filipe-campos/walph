import { act, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TimelineItem } from '../../lib/claudeTimeline'
import { installFakeApi } from '../../test/fakeApi'
import { mount, unmountAll } from '../../test/dom'

installFakeApi()
const { useTimelineScroll } = await import('./useTimelineScroll')
const { useStore } = await import('../../store')
const { resetStore } = await import('../../test/resetStore')
const { createConversation } = await import('../../lib/claudeConversation')

const SCROLL_HEIGHT = 1000
const CLIENT_HEIGHT = 300
const ITEM_HEIGHT = 100

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  readonly observed = new Set<Element>()
  disconnected = false
  constructor(readonly callback: () => void) {
    FakeResizeObserver.instances.push(this)
  }
  observe(el: Element): void {
    this.observed.add(el)
  }
  unobserve(el: Element): void {
    this.observed.delete(el)
  }
  disconnect(): void {
    this.disconnected = true
    this.observed.clear()
  }
}

const original = {
  scrollTop: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!,
  scrollHeight: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight')!,
  clientHeight: Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')!
}
const scrolls = new WeakMap<Element, number>()

function fakeLayout(): void {
  Object.defineProperty(Element.prototype, 'scrollTop', {
    configurable: true,
    get(this: Element) {
      return scrolls.get(this) ?? 0
    },
    set(this: Element, value: number) {
      scrolls.set(this, value)
    }
  })
  Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, get: () => SCROLL_HEIGHT })
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => CLIENT_HEIGHT })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(ITEM_HEIGHT)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const flow = this.id === 'list' ? 0 : Number(this.getAttribute('data-flow') ?? 0)
    const top = this.id === 'list' ? 0 : flow - (scrolls.get(this.parentElement!) ?? 0)
    return { top, left: 0, right: 0, bottom: top, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) }
  })
}

const item = (key: string): TimelineItem => ({ type: 'thinking', key, text: key, depth: 0 })
const itemsOf = (n: number): TimelineItem[] => Array.from({ length: n }, (_, i) => item(`k${i}`))

interface Props {
  conversationId?: string
  items?: TimelineItem[]
  lastUserIndex?: number
  active?: boolean
  busy?: boolean
}

function Timeline({
  conversationId = first,
  items = itemsOf(5),
  lastUserIndex = -1,
  active = true,
  busy = false
}: Props) {
  const { scrollRef, onScroll } = useTimelineScroll({
    conversationId,
    items,
    lastUserIndex,
    streaming: [],
    permissions: [],
    queued: [],
    background: [],
    busy,
    active
  })
  const children = items.flatMap((it, i) => {
    const node = <div key={it.key} data-flow={i * ITEM_HEIGHT} />
    return i === lastUserIndex ? [<div key="pinned" data-pinned />, node] : [node]
  })
  return (
    <div id="list" ref={scrollRef} onScroll={onScroll}>
      {children}
    </div>
  )
}

function Host({ initial, expose }: { initial: Props; expose: (set: (props: Props) => void) => void }) {
  const [props, setProps] = useState(initial)
  expose((next) => setProps((current) => ({ ...current, ...next })))
  return <Timeline {...props} />
}

// The scroll memory belongs to the module: each test uses its own conversation so it does not inherit the previous
// one's.
let sequence = 0

function setup(props: Props = {}) {
  props = { conversationId: `conv-${++sequence}`, ...props }
  let update: (props: Props) => void = () => {}
  mount(<Host initial={props} expose={(set) => (update = set)} />)
  const list = (): HTMLElement => document.getElementById('list')!
  return { list, rerender: (next: Props) => act(() => update(next)) }
}

function scrollTo(list: HTMLElement, top: number): void {
  list.scrollTop = top
  act(() => {
    list.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
}

const observer = (): FakeResizeObserver => FakeResizeObserver.instances.at(-1)!
const BOTTOM = SCROLL_HEIGHT - CLIENT_HEIGHT

let runs = 0
let first = ''
let second = ''

beforeEach(() => {
  runs++
  first = `run-${runs}-a`
  second = `run-${runs}-b`
  FakeResizeObserver.instances = []
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  fakeLayout()
  const conversations = [first, second].map((id) =>
    createConversation({ id, messages: [], favorite: false }, { permissionMode: 'default', model: 'm' })
  )
  useStore.setState((s) => ({ claude: { ...s.claude, activeId: first, conversations } }))
})

afterEach(() => {
  unmountAll()
  resetStore()
  for (const [name, descriptor] of Object.entries(original)) Object.defineProperty(Element.prototype, name, descriptor)
})

describe('sticking to the end', () => {
  it('a new conversation opens scrolled to the end', () => {
    const { list } = setup()
    expect(list().scrollTop).toBe(SCROLL_HEIGHT)
  })

  it('new items keep the end while the user has not scrolled up', () => {
    const { list, rerender } = setup()
    list().scrollTop = 0
    rerender({ items: itemsOf(6) })
    expect(list().scrollTop).toBe(SCROLL_HEIGHT)
  })

  it('scrolling away from the end releases the list: new items do not pull it back', () => {
    const { list, rerender } = setup()
    scrollTo(list(), 200)
    rerender({ items: itemsOf(6) })
    expect(list().scrollTop).toBe(200)
  })

  it('at 48 px from the end it is still released and under 48 px it sticks again', () => {
    const { list, rerender } = setup()
    scrollTo(list(), BOTTOM - 48)
    rerender({ items: itemsOf(6) })
    expect(list().scrollTop).toBe(BOTTOM - 48)
    scrollTo(list(), BOTTOM - 47)
    rerender({ items: itemsOf(7) })
    expect(list().scrollTop).toBe(SCROLL_HEIGHT)
  })

  it('the panel reappearing (active) and the busy state also go to the end when stuck', () => {
    const { list, rerender } = setup({ active: false })
    list().scrollTop = 0
    rerender({ active: true })
    expect(list().scrollTop).toBe(SCROLL_HEIGHT)
    list().scrollTop = 0
    rerender({ busy: true })
    expect(list().scrollTop).toBe(SCROLL_HEIGHT)
  })

  it('released, not even the panel reappearing moves the list', () => {
    const { list, rerender } = setup({ active: false })
    scrollTo(list(), 100)
    rerender({ active: true })
    expect(list().scrollTop).toBe(100)
  })
})

describe('size observer', () => {
  it('observes the list and each child; content that grows with the list stuck goes to the end', () => {
    const { list } = setup()
    expect(observer().observed.has(list())).toBe(true)
    expect([...list().children].every((child) => observer().observed.has(child))).toBe(true)
    list().scrollTop = 0
    observer().callback()
    expect(list().scrollTop).toBe(SCROLL_HEIGHT)
  })

  it('with the list released the content growth does not scroll', () => {
    const { list } = setup()
    scrollTo(list(), 100)
    observer().callback()
    expect(list().scrollTop).toBe(100)
  })

  it('new children enter the observer and the removed ones are released, in a single observer', () => {
    const { list, rerender } = setup({ items: itemsOf(3) })
    const removed = list().children[0]
    rerender({ items: [item('k1'), item('k2'), item('k3')] })
    expect(FakeResizeObserver.instances).toHaveLength(1)
    expect(observer().observed.has(removed)).toBe(false)
    expect([...list().children].every((child) => observer().observed.has(child))).toBe(true)
    expect(observer().observed.size).toBe(1 + 3)
  })

  it('unmounting disconnects the observer', () => {
    setup()
    unmountAll()
    expect(observer().disconnected).toBe(true)
  })

  it('without ResizeObserver in the environment the list keeps working', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    const { list } = setup()
    expect(list().scrollTop).toBe(SCROLL_HEIGHT)
  })
})

describe('restoring the reading position', () => {
  const here = (props: Props = {}): Props => ({ conversationId: first, ...props })

  function leaveAt(top: number, props: Props = {}): void {
    const { list } = setup(here(props))
    scrollTo(list(), top)
    unmountAll()
  }

  it('returns to the same point: anchor on the first visible item plus the offset within it', () => {
    leaveAt(250, { items: itemsOf(8) })
    const { list } = setup(here({ items: itemsOf(8) }))
    expect(list().scrollTop).toBe(250)
  })

  it('the anchor follows the item even if the estimated height of the ones above changed', () => {
    leaveAt(250, { items: itemsOf(8) })
    const { list } = setup(here({ items: itemsOf(8) }))
    expect(list().scrollTop).toBe(250)
    unmountAll()
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const flow = this.id === 'list' ? 0 : Number(this.getAttribute('data-flow')) + 40
      const top = this.id === 'list' ? 0 : flow - (scrolls.get(this.parentElement!) ?? 0)
      return { top, left: 0, right: 0, bottom: top, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) }
    })
    const again = setup(here({ items: itemsOf(8) }))
    expect(again.list().scrollTop).toBe(290)
  })

  it('with the pinned message (extra strip before it) the anchor still points to the right item', () => {
    leaveAt(250, { items: itemsOf(8), lastUserIndex: 1 })
    const { list } = setup(here({ items: itemsOf(8), lastUserIndex: 1 }))
    expect(list().scrollTop).toBe(250)
  })

  it('left at the end, returns to the end', () => {
    leaveAt(BOTTOM, { items: itemsOf(8) })
    const { list } = setup(here({ items: itemsOf(8) }))
    expect(list().scrollTop).toBe(SCROLL_HEIGHT)
  })

  it('each conversation has its own memory', () => {
    leaveAt(250, { conversationId: first })
    const { list } = setup({ conversationId: second })
    expect(list().scrollTop).toBe(SCROLL_HEIGHT)
  })

  it('an anchor that left the list keeps the scroll as is, without pulling to the end', () => {
    leaveAt(250, { items: itemsOf(8) })
    const { list } = setup(here({ items: [item('x0'), item('x1')] }))
    expect(list().scrollTop).toBe(0)
  })

  it('scrolling past the end of the content (no visible item) does not break and leaves no anchor', () => {
    leaveAt(3 * ITEM_HEIGHT, { items: itemsOf(3) })
    const { list } = setup(here({ items: itemsOf(3) }))
    expect(list().scrollTop).toBe(0)
  })

  it('the memory of closed conversations is dropped when another mounts', () => {
    leaveAt(250, { conversationId: first, items: itemsOf(8) })
    const open = useStore.getState().claude.conversations.filter((c) => c.id !== first)
    useStore.setState((s) => ({ claude: { ...s.claude, conversations: open } }))
    setup({ conversationId: second })
    unmountAll()
    const all = [first, second].map((id) =>
      createConversation({ id, messages: [], favorite: false }, { permissionMode: 'default', model: 'm' })
    )
    useStore.setState((s) => ({ claude: { ...s.claude, conversations: all } }))
    const { list } = setup({ conversationId: first, items: itemsOf(8) })
    expect(list().scrollTop).toBe(SCROLL_HEIGHT)
  })
})
