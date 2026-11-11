import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { viewEpoch } from './viewLifecycle'
import { createViewRegistry } from './viewResources'

interface FakeWc extends EventEmitter {
  destroyed: boolean
  isDestroyed(): boolean
}

function fakeWc(): FakeWc {
  const wc = new EventEmitter() as FakeWc
  wc.destroyed = false
  wc.isDestroyed = () => wc.destroyed
  return wc
}

const asWc = (wc: FakeWc): never => wc as never

interface Item {
  name: string
}

let keySeq = 0

function setup(
  options: { disposeSync?: (items: Item[]) => void; dispose?: (item: Item) => void | Promise<void> } = {}
) {
  const disposed: string[] = []
  const registry = createViewRegistry<Item>({
    key: `test:${keySeq++}`,
    dispose: (item) => {
      disposed.push(item.name)
      return options.dispose?.(item)
    },
    ...(options.disposeSync ? { disposeSync: options.disposeSync } : {})
  })
  return { registry, disposed }
}

afterEach(() => vi.restoreAllMocks())

describe('createViewRegistry', () => {
  it('stores and returns items by view and id', () => {
    const { registry } = setup()
    const wc = fakeWc()
    const a = { name: 'a' }
    registry.add(asWc(wc), 'a', a)
    expect(registry.get(asWc(wc), 'a')).toBe(a)
    expect(registry.values(asWc(wc))).toEqual([a])
    expect(registry.has(asWc(wc))).toBe(true)
    expect(registry.get(asWc(wc), 'b')).toBeUndefined()
  })

  it('a foreign view neither sees nor releases items of another', () => {
    const { registry, disposed } = setup()
    const owner = fakeWc()
    const foreign = fakeWc()
    registry.add(asWc(owner), 'a', { name: 'a' })
    expect(registry.get(asWc(foreign), 'a')).toBeUndefined()
    expect(registry.values(asWc(foreign))).toEqual([])
    expect(registry.has(asWc(foreign))).toBe(false)
    void registry.dispose(asWc(foreign), 'a')
    foreign.emit('did-navigate')
    expect(disposed).toEqual([])
    expect(registry.get(asWc(owner), 'a')).toBeDefined()
  })

  it.each(['did-navigate', 'render-process-gone', 'destroyed'])('releases the view items on %s', (event) => {
    const { registry, disposed } = setup()
    const wc = fakeWc()
    const other = fakeWc()
    registry.add(asWc(wc), 'a', { name: 'a' })
    registry.add(asWc(wc), 'b', { name: 'b' })
    registry.add(asWc(other), 'c', { name: 'c' })
    wc.emit(event)
    expect(disposed).toEqual(['a', 'b'])
    expect(registry.has(asWc(wc))).toBe(false)
    expect(registry.has(asWc(other))).toBe(true)
  })

  it('the released item already left the registry and is marked cancelled', () => {
    const wc = fakeWc()
    const seen: Array<{ has: boolean; cancelled: boolean }> = []
    const item = { name: 'a' }
    const registry = createViewRegistry<Item>({
      key: 'test:state',
      dispose: (i) => {
        seen.push({ has: registry.has(asWc(wc)), cancelled: registry.wasCancelled(i) })
      }
    })
    registry.add(asWc(wc), 'a', item)
    wc.emit('did-navigate')
    expect(seen).toEqual([{ has: false, cancelled: true }])
    expect(registry.wasCancelled(item)).toBe(true)
  })

  it('owner cancellation is not confused with deadline or natural end', () => {
    const { registry } = setup()
    const wc = fakeWc()
    const finished = { name: 'finished' }
    const timedOut = { name: 'timedOut' }
    const reset = { name: 'reset' }
    registry.add(asWc(wc), 'finished', finished)
    registry.add(asWc(wc), 'timedOut', timedOut)
    registry.add(asWc(wc), 'reset', reset)
    registry.delete(asWc(wc), 'finished')
    registry.delete(asWc(wc), 'timedOut')
    wc.emit('did-navigate')
    expect(registry.wasCancelled(finished)).toBe(false)
    expect(registry.wasCancelled(timedOut)).toBe(false)
    expect(registry.wasCancelled(reset)).toBe(true)
  })

  it('markCancelled marks without removing from the registry', () => {
    const { registry } = setup()
    const wc = fakeWc()
    const item = { name: 'a' }
    registry.add(asWc(wc), 'a', item)
    registry.markCancelled(item)
    expect(registry.wasCancelled(item)).toBe(true)
    expect(registry.get(asWc(wc), 'a')).toBe(item)
  })

  it('delete removes without releasing and, with expected, only removes the current item', () => {
    const { registry, disposed } = setup()
    const wc = fakeWc()
    const first = { name: 'first' }
    const second = { name: 'second' }
    registry.add(asWc(wc), 'slot', first)
    registry.add(asWc(wc), 'slot', second)
    expect(registry.delete(asWc(wc), 'slot', first)).toBe(false)
    expect(registry.get(asWc(wc), 'slot')).toBe(second)
    expect(registry.delete(asWc(wc), 'slot', second)).toBe(true)
    expect(registry.has(asWc(wc))).toBe(false)
    expect(registry.delete(asWc(wc), 'slot')).toBe(false)
    expect(disposed).toEqual([])
  })

  it('dispose removes and releases an item; an unknown id does nothing', async () => {
    const { registry, disposed } = setup()
    const wc = fakeWc()
    registry.add(asWc(wc), 'a', { name: 'a' })
    registry.add(asWc(wc), 'b', { name: 'b' })
    await registry.dispose(asWc(wc), 'a')
    await registry.dispose(asWc(wc), 'missing')
    expect(disposed).toEqual(['a'])
    expect(registry.get(asWc(wc), 'b')).toBeDefined()
  })

  it('track needs no id and returns the unregister function', () => {
    const { registry, disposed } = setup()
    const wc = fakeWc()
    const a = { name: 'a' }
    const b = { name: 'b' }
    const untrackA = registry.track(asWc(wc), a)
    registry.track(asWc(wc), b)
    untrackA()
    untrackA()
    expect(registry.values(asWc(wc))).toEqual([b])
    wc.emit('destroyed')
    expect(disposed).toEqual(['b'])
  })

  it('scope registers on the view and reports owner cancellation', () => {
    const { registry, disposed } = setup()
    const wc = fakeWc()
    const scope = registry.scope(asWc(wc))
    const a = { name: 'a' }
    const b = { name: 'b' }
    const untrackA = scope.track(a)
    scope.track(b)
    untrackA()
    expect(registry.values(asWc(wc))).toEqual([b])
    expect(scope.wasCancelled(b)).toBe(false)
    wc.emit('destroyed')
    expect(disposed).toEqual(['b'])
    expect(scope.wasCancelled(b)).toBe(true)
    expect(scope.wasCancelled(a)).toBe(false)
  })

  it('disposeAll awaits async releases and isolates failures', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let closed = false
    const { registry } = setup({
      dispose: async (item) => {
        if (item.name === 'bad') throw new Error('failed')
        await Promise.resolve()
        closed = true
      }
    })
    const wc = fakeWc()
    registry.add(asWc(wc), 'bad', { name: 'bad' })
    registry.add(asWc(wc), 'good', { name: 'good' })
    await registry.disposeAll(asWc(wc))
    expect(closed).toBe(true)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('a synchronous dispose that throws does not stop the other items', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { registry, disposed } = setup({
      dispose: (item) => {
        if (item.name === 'a') throw new Error('x')
      }
    })
    const wc = fakeWc()
    registry.add(asWc(wc), 'a', { name: 'a' })
    registry.add(asWc(wc), 'b', { name: 'b' })
    wc.emit('did-navigate')
    expect(disposed).toEqual(['a', 'b'])
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('arms a single reset hook per view, even with several items', () => {
    const { registry } = setup()
    const wc = fakeWc()
    registry.add(asWc(wc), 'a', { name: 'a' })
    registry.add(asWc(wc), 'b', { name: 'b' })
    registry.track(asWc(wc), { name: 'c' })
    expect(wc.listenerCount('did-navigate')).toBe(1)
  })

  it('entries lists the items of all views with their owner', () => {
    const { registry } = setup()
    const one = fakeWc()
    const two = fakeWc()
    const a = { name: 'a' }
    const b = { name: 'b' }
    registry.add(asWc(one), 'a', a)
    registry.add(asWc(two), 'b', b)
    expect(registry.entries()).toEqual([
      [one, a],
      [two, b]
    ])
  })

  describe('guardEpoch', () => {
    it('does not throw when the view is the same after the await', async () => {
      const { registry } = setup()
      const wc = fakeWc()
      const assertAlive = registry.guardEpoch(asWc(wc))
      await Promise.resolve()
      expect(() => assertAlive(() => new Error('cancelled'))).not.toThrow()
    })

    it.each(['did-navigate', 'render-process-gone'])(
      'throws if the view restarted (%s) during the await',
      async (event) => {
        const { registry } = setup()
        const wc = fakeWc()
        const assertAlive = registry.guardEpoch(asWc(wc))
        await Promise.resolve()
        wc.emit(event)
        expect(() => assertAlive(() => new Error('cancelled'))).toThrow('cancelled')
      }
    )

    it('throws if the view was destroyed during the await', () => {
      const { registry } = setup()
      const wc = fakeWc()
      const assertAlive = registry.guardEpoch(asWc(wc))
      wc.destroyed = true
      expect(() => assertAlive(() => new Error('destroyed'))).toThrow('destroyed')
    })

    it('arms the hook by itself: the epoch advances even without any item registered before', () => {
      const { registry } = setup()
      const wc = fakeWc()
      const assertAlive = registry.guardEpoch(asWc(wc))
      expect(viewEpoch(asWc(wc))).toBe(0)
      wc.emit('did-navigate')
      expect(viewEpoch(asWc(wc))).toBe(1)
      expect(() => assertAlive(() => new Error('x'))).toThrow()
    })

    it('a new guard, taken after the reset, holds again', () => {
      const { registry } = setup()
      const wc = fakeWc()
      registry.guardEpoch(asWc(wc))
      wc.emit('did-navigate')
      const fresh = registry.guardEpoch(asWc(wc))
      expect(() => fresh(() => new Error('x'))).not.toThrow()
    })
  })

  describe('disposeAllSync', () => {
    it('releases everything from all views, each item via dispose, and empties the registry', () => {
      const { registry, disposed } = setup()
      const one = fakeWc()
      const two = fakeWc()
      const a = { name: 'a' }
      registry.add(asWc(one), 'a', a)
      registry.add(asWc(two), 'b', { name: 'b' })
      registry.disposeAllSync()
      expect(disposed).toEqual(['a', 'b'])
      expect(registry.has(asWc(one))).toBe(false)
      expect(registry.has(asWc(two))).toBe(false)
      expect(registry.wasCancelled(a)).toBe(true)
    })

    it('uses batch disposeSync when it exists, instead of dispose', () => {
      const batches: string[][] = []
      const { registry, disposed } = setup({ disposeSync: (items) => batches.push(items.map((i) => i.name)) })
      const wc = fakeWc()
      registry.add(asWc(wc), 'a', { name: 'a' })
      registry.add(asWc(wc), 'b', { name: 'b' })
      registry.disposeAllSync()
      expect(batches).toEqual([['a', 'b']])
      expect(disposed).toEqual([])
    })

    it('a disposeSync that throws is logged and does not propagate', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const { registry } = setup({
        disposeSync: () => {
          throw new Error('x')
        }
      })
      registry.add(asWc(fakeWc()), 'a', { name: 'a' })
      expect(() => registry.disposeAllSync()).not.toThrow()
      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('does nothing with an empty registry', () => {
      const batches: string[][] = []
      const { registry } = setup({ disposeSync: (items) => batches.push(items.map((i) => i.name)) })
      registry.disposeAllSync()
      expect(batches).toEqual([[]])
    })
  })
})
