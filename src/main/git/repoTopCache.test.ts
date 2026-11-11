import { describe, expect, it, vi } from 'vitest'
import { createRepoTopCache } from './repoTopCache'

describe('createRepoTopCache', () => {
  it('reuses the result within the TTL and queries again afterwards', async () => {
    let t = 0
    const find = vi.fn(async (root: string) => `${root}/top`)
    const cache = createRepoTopCache(find, { ttlMs: 1000, now: () => t })
    await cache.get('/r')
    t = 999
    await cache.get('/r')
    expect(find).toHaveBeenCalledTimes(1)
    t = 1001
    await cache.get('/r')
    expect(find).toHaveBeenCalledTimes(2)
  })

  it('concurrent calls share the lookup; different folders do not mix', async () => {
    const find = vi.fn(async (root: string) => root)
    const cache = createRepoTopCache(find)
    await Promise.all([cache.get('/a'), cache.get('/a'), cache.get('/b')])
    expect(find).toHaveBeenCalledTimes(2)
  })

  it('a failure has a short TTL and invalidate forces a new lookup', async () => {
    let t = 0
    const find = vi.fn().mockRejectedValueOnce(new Error('not a repo')).mockResolvedValue('/r')
    const cache = createRepoTopCache(find, { negativeTtlMs: 100, now: () => t })
    await expect(cache.get('/r')).rejects.toThrow()
    await expect(cache.get('/r')).rejects.toThrow()
    expect(find).toHaveBeenCalledTimes(1)
    t = 101
    expect(await cache.get('/r')).toBe('/r')
    cache.invalidate('/r')
    await cache.get('/r')
    expect(find).toHaveBeenCalledTimes(3)
  })
})
