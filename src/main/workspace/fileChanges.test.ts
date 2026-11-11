import { describe, expect, it } from 'vitest'
import type { FileChange } from '@shared/types'
import { isInsideGit, pushFileChange } from './fileChanges'

describe('isInsideGit', () => {
  it('recognizes the folder and its children, but not similar names', () => {
    expect(isInsideGit('/p/.git')).toBe(true)
    expect(isInsideGit('/p/.git/HEAD')).toBe(true)
    expect(isInsideGit('/p/.gitignore')).toBe(false)
  })
})

describe('pushFileChange', () => {
  it('consolidates by path keeping the order of the most recent occurrence', () => {
    const batch = new Map<string, FileChange>()
    pushFileChange(batch, { path: '/a', type: 'change' })
    pushFileChange(batch, { path: '/b', type: 'change' })
    pushFileChange(batch, { path: '/a', type: 'change' })
    expect([...batch.keys()]).toEqual(['/b', '/a'])
  })

  it('the last type of each path wins', () => {
    const batch = new Map<string, FileChange>()
    pushFileChange(batch, { path: '/a', type: 'unlink' })
    pushFileChange(batch, { path: '/a', type: 'add' })
    expect([...batch.values()]).toEqual([{ path: '/a', type: 'add' }])
  })
})
