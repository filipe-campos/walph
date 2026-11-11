import { describe, expect, it } from 'vitest'
import type { RecentFolder } from '@shared/types'
import { filterRecents } from './recentFilter'

const f = (path: string, branch: string | null = null): RecentFolder => ({ path, lastOpened: null, branch })
const list = [f('/dev/billing-api', 'main'), f('/dev/Shop-Web', 'feat/cart'), f('/work/club-app')]

describe('filterRecents', () => {
  it('without a query returns everything', () => {
    expect(filterRecents(list, '  ')).toHaveLength(3)
  })
  it('matches name, path and branch case-insensitively', () => {
    expect(filterRecents(list, 'SHOP').map((x) => x.path)).toEqual(['/dev/Shop-Web'])
    expect(filterRecents(list, '/work').map((x) => x.path)).toEqual(['/work/club-app'])
    expect(filterRecents(list, 'cart').map((x) => x.path)).toEqual(['/dev/Shop-Web'])
  })
  it('all the terms need to match', () => {
    expect(filterRecents(list, 'dev api')).toHaveLength(1)
    expect(filterRecents(list, 'dev zzz')).toHaveLength(0)
  })
})
