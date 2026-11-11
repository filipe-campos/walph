import { describe, expect, it } from 'vitest'
import type { WorkspaceInfo } from '@shared/types'
import {
  branchToReport,
  isNoticeStale,
  isViewActive,
  nthWorkspaceId,
  parentFolderName,
  stepWorkspaceId,
  truncateText,
  unreadLabel
} from './workspaces'

const ws = (id: string, extra: Partial<WorkspaceInfo> = {}): WorkspaceInfo => ({
  id,
  name: id,
  root: `/r/${id}`,
  branch: null,
  status: 'idle',
  unread: 0,
  active: false,
  dormant: false,
  muted: false,
  ...extra
})

describe('workspaces', () => {
  const list = [ws('a'), ws('b', { active: true }), ws('c')]

  it('isViewActive', () => {
    expect(isViewActive(null)).toBe(true)
    expect(isViewActive({ selfId: 'b', workspaces: list })).toBe(true)
    expect(isViewActive({ selfId: 'a', workspaces: list })).toBe(false)
  })

  it('nthWorkspaceId', () => {
    expect(nthWorkspaceId(list, 1)).toBe('a')
    expect(nthWorkspaceId(list, 4)).toBeNull()
  })

  it('stepWorkspaceId is cyclic', () => {
    expect(stepWorkspaceId(list, 1)).toBe('c')
    expect(stepWorkspaceId(list, -1)).toBe('a')
    expect(stepWorkspaceId([ws('a', { active: true }), ws('b')], -1)).toBe('b')
    expect(stepWorkspaceId([ws('a', { active: true })], 1)).toBeNull()
  })

  it('branchToReport', () => {
    const git = {
      isRepo: true,
      repoRoot: '/r',
      branch: 'main',
      upstream: null,
      ahead: 0,
      behind: 0,
      ignored: [],
      files: []
    }
    expect(branchToReport(null, null)).toBeNull()
    expect(branchToReport('/r', null)).toBeUndefined()
    expect(branchToReport('/r', null, '/r')).toBeNull()
    expect(branchToReport('/r', null, '/outra')).toBeUndefined()
    expect(branchToReport('/r', git)).toBe('main')
    expect(branchToReport('/r', { ...git, isRepo: false })).toBeNull()
    expect(branchToReport('/r', { ...git, branch: null })).toBeNull()
  })

  it('isNoticeStale', () => {
    expect(isNoticeStale(list, 'zzz')).toBe(true)
    expect(isNoticeStale(list, 'b')).toBe(true)
    expect(isNoticeStale(list, 'a')).toBe(true)
    expect(isNoticeStale([ws('a', { unread: 1 })], 'a')).toBe(false)
    expect(isNoticeStale([ws('a', { status: 'attention' })], 'a')).toBe(false)
  })

  it('truncateText and unreadLabel', () => {
    expect(truncateText('  a\n b  ', 10)).toBe('a b')
    expect(truncateText('abcdefghij', 5)).toBe('abcd…')
    expect(unreadLabel(3)).toBe('3')
    expect(unreadLabel(120)).toBe('99+')
  })

  it('isViewActive: a selfId not in the list counts as inactive; an empty list too', () => {
    expect(isViewActive({ selfId: 'zzz', workspaces: list })).toBe(false)
    expect(isViewActive({ selfId: 'a', workspaces: [] })).toBe(false)
  })

  it('nthWorkspaceId: 0, negative and fraction do not exist; empty list', () => {
    expect(nthWorkspaceId(list, 0)).toBeNull()
    expect(nthWorkspaceId(list, -1)).toBeNull()
    expect(nthWorkspaceId(list, 1.5)).toBeNull()
    expect(nthWorkspaceId([], 1)).toBeNull()
    expect(nthWorkspaceId(list, 3)).toBe('c')
  })

  it('stepWorkspaceId: from the last goes back to the first, from the first to the last; without an active one starts from the first', () => {
    expect(stepWorkspaceId([ws('a'), ws('b'), ws('c', { active: true })], 1)).toBe('a')
    expect(stepWorkspaceId([ws('a', { active: true }), ws('b'), ws('c')], -1)).toBe('c')
    expect(stepWorkspaceId([ws('a'), ws('b')], 1)).toBe('b')
    expect(stepWorkspaceId([], 1)).toBeNull()
  })

  it('branchToReport: git that failed in the current folder is null; in another folder still unknown', () => {
    expect(branchToReport('/r', null, '/r')).toBeNull()
    expect(branchToReport('/r', null, null)).toBeUndefined()
    expect(branchToReport('', null)).toBeNull()
  })

  it('isNoticeStale: a dormant workspace with unread ones still counts; read and without a request does not', () => {
    expect(isNoticeStale([ws('a', { dormant: true, unread: 2 })], 'a')).toBe(false)
    expect(isNoticeStale([ws('a', { status: 'done', unread: 0 })], 'a')).toBe(true)
    expect(isNoticeStale([ws('a', { status: 'error', unread: 1 })], 'a')).toBe(false)
    expect(isNoticeStale([], 'a')).toBe(true)
  })

  it('truncateText: the exact limit does not cut; the ellipsis leaves no dangling space; empty', () => {
    expect(truncateText('abcde', 5)).toBe('abcde')
    expect(truncateText('ab cdefg', 4)).toBe('ab…')
    expect(truncateText('   \n\t ', 10)).toBe('')
    expect(truncateText('unread: task done', 12)).toBe('unread: tas…')
  })

  it('unreadLabel: 99 shows whole, 100 becomes 99+', () => {
    expect(unreadLabel(0)).toBe('0')
    expect(unreadLabel(99)).toBe('99')
    expect(unreadLabel(100)).toBe('99+')
  })
})

describe('dragging tabs', () => {
  it('parentFolderName', () => {
    expect(parentFolderName('/Users/f/Chargeblast-1/chargeblast-monorepo')).toBe('Chargeblast-1')
    expect(parentFolderName('/Users/f/proj/')).toBe('f')
    expect(parentFolderName('C:\\dev\\Cliente\\repo')).toBe('Cliente')
    expect(parentFolderName('/repo')).toBeNull()
    expect(parentFolderName('C:\\repo')).toBeNull()
    expect(parentFolderName('/')).toBeNull()
    expect(parentFolderName(null)).toBeNull()
    expect(parentFolderName('')).toBeNull()
  })
})
