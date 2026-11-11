import { describe, expect, it, vi } from 'vitest'
import { createSharedCache } from './sharedCache'

describe('createSharedCache', () => {
  it('concurrent calls within the deadline share one run', async () => {
    let t = 0
    const cache = createSharedCache<number>(() => t)
    const load = vi.fn(async () => 1)
    await Promise.all([cache.get('docker', 5000, load), cache.get('docker', 5000, load)])
    t = 4000
    await cache.get('docker', 5000, load)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('each call imposes its own max age', async () => {
    let t = 0
    const cache = createSharedCache<number>(() => t)
    const load = vi.fn(async () => 1)
    await cache.get('docker', 25_000, load)
    t = 10_000
    await cache.get('docker', 25_000, load) // background: accepts 10 s
    expect(load).toHaveBeenCalledTimes(1)
    await cache.get('docker', 3000, load) // open screen: demands fresh
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('different keys do not mix; a failure is not cached', async () => {
    const cache = createSharedCache<number>()
    const load = vi.fn().mockRejectedValueOnce(new Error('daemon down')).mockResolvedValue(2)
    await expect(cache.get('a', 5000, load)).rejects.toThrow('daemon down')
    expect(await cache.get('a', 5000, load)).toBe(2)
    expect(await cache.get('b', 5000, load)).toBe(2)
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('invalidate drops the result and what was in flight', async () => {
    const cache = createSharedCache<string>()
    let resolveOld!: (v: string) => void
    const old = cache.get('a', 5000, () => new Promise<string>((r) => (resolveOld = r)))
    cache.invalidate('a')
    const fresh = await cache.get('a', 5000, async () => 'new')
    resolveOld('old')
    expect(await old).toBe('old')
    expect(fresh).toBe('new')
    expect(await cache.get('a', 5000, async () => 'other')).toBe('new')
  })
})
