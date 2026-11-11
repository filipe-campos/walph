import { describe, expect, it } from 'vitest'
import { pathSegments } from './breadcrumbs'

describe('pathSegments', () => {
  it('folders from the root down to the file, each with the folder that contains it', () => {
    expect(pathSegments('/p', '/p/src/lib/a.ts')).toEqual([
      { name: 'src', path: '/p/src', parent: '/p' },
      { name: 'lib', path: '/p/src/lib', parent: '/p/src' },
      { name: 'a.ts', path: '/p/src/lib/a.ts', parent: '/p/src/lib' }
    ])
  })

  it('root with a trailing slash and Windows paths', () => {
    expect(pathSegments('/', '/a.ts')).toEqual([{ name: 'a.ts', path: '/a.ts', parent: '/' }])
    expect(pathSegments('C:\\p', 'C:\\p\\src\\a.ts')).toEqual([
      { name: 'src', path: 'C:\\p\\src', parent: 'C:\\p' },
      { name: 'a.ts', path: 'C:\\p\\src\\a.ts', parent: 'C:\\p\\src' }
    ])
  })

  it('outside the folder (or without a folder) only the file', () => {
    expect(pathSegments('/p', '/q/b.ts')).toEqual([{ name: 'b.ts', path: '/q/b.ts', parent: '/q' }])
    expect(pathSegments(null, '/q/b.ts')).toEqual([{ name: 'b.ts', path: '/q/b.ts', parent: '/q' }])
  })
})
