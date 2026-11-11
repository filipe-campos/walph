import { describe, expect, it } from 'vitest'
import { rankRecentFolders } from './recentFolders'

const paths = ['/work/walph', '/work/api', '/home/me/notes']
const folders = paths.map((path) => ({ path, lastOpened: null, branch: null }))

describe('rankRecentFolders', () => {
  it('without a query keeps the order and splits name and directory', () => {
    const list = rankRecentFolders('', folders, null, 'linux')
    expect(list.map((f) => f.path)).toEqual(paths)
    expect(list[0]).toMatchObject({ name: 'walph', nameStart: 6 })
  })

  it('removes the open folder', () => {
    expect(rankRecentFolders('', folders, '/work/api', 'linux').map((f) => f.path)).toEqual([
      '/work/walph',
      '/home/me/notes'
    ])
  })

  it('filters by the query and sorts by the best match', () => {
    const list = rankRecentFolders('not', folders, null, 'linux')
    expect(list.map((f) => f.path)).toEqual(['/home/me/notes'])
    expect(list[0].matches.length).toBe(3)
  })

  it('a query without a match returns empty', () => {
    expect(rankRecentFolders('zzzz', folders, null, 'linux')).toEqual([])
  })
})
