import { describe, expect, it } from 'vitest'
import { changesFileList } from './fileListChange'

describe('changesFileList', () => {
  it('creation and removal always invalidate', () => {
    expect(changesFileList({ path: '/p/a.ts', type: 'add' })).toBe(true)
    expect(changesFileList({ path: '/p/a.ts', type: 'unlink' })).toBe(true)
  })

  it('an edit only invalidates on an ignore file, at any level', () => {
    expect(changesFileList({ path: '/p/a.ts', type: 'change' })).toBe(false)
    expect(changesFileList({ path: '/p/sub/.gitignore', type: 'change' })).toBe(true)
    expect(changesFileList({ path: 'C:\\p\\sub\\.rgignore', type: 'change' })).toBe(true)
    expect(changesFileList({ path: '/p/x.gitignore', type: 'change' })).toBe(false)
  })
})
