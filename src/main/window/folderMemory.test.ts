import { describe, expect, it } from 'vitest'
import { nextRememberedFolders } from './folderMemory'

describe('nextRememberedFolders', () => {
  it('the first list becomes the memory', () => {
    expect(nextRememberedFolders(undefined, ['/a'])).toEqual(['/a'])
    expect(nextRememberedFolders(undefined, [])).toEqual([])
  })

  it('new folder: the memory becomes the current list', () => {
    expect(nextRememberedFolders(['/a', '/b'], ['/a', '/b', '/c'])).toEqual(['/a', '/b', '/c'])
  })

  it('removals do not shrink the memory', () => {
    let memory = nextRememberedFolders(undefined, ['/a', '/b', '/c'])
    memory = nextRememberedFolders(memory, ['/b', '/c'])
    memory = nextRememberedFolders(memory, ['/c'])
    memory = nextRememberedFolders(memory, [])
    expect(memory).toEqual(['/a', '/b', '/c'])
  })

  it('reordering does not count as a gain', () => {
    expect(nextRememberedFolders(['/a', '/b'], ['/b', '/a'])).toEqual(['/a', '/b'])
  })
})
