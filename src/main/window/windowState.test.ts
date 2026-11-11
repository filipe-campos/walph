import type { BaseWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ BaseWindow: { getFocusedWindow: () => null } }))

import { findWorkspaceByRoot, registerHost, unregisterHost, type Host, type Workspace } from './windowState'

const realPlatform = process.platform
const setPlatform = (platform: string): void => {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}

function makeHost(roots: Array<string | null>, options: { closing?: boolean; destroyed?: boolean } = {}): Host {
  const host = {
    win: { isDestroyed: () => options.destroyed === true } as unknown as BaseWindow,
    workspaces: [] as Workspace[],
    activeId: '',
    closing: options.closing === true
  }
  host.workspaces = roots.map((root, i) => ({
    id: `w${i}`,
    root,
    branch: null,
    muted: false,
    view: null,
    host,
    lastActiveAt: 0
  }))
  return host
}

describe('findWorkspaceByRoot', () => {
  const registered: Host[] = []
  const register = (host: Host): Host => {
    registerHost(host)
    registered.push(host)
    return host
  }

  beforeEach(() => setPlatform('linux'))
  afterEach(() => {
    for (const h of registered.splice(0)) unregisterHost(h)
    setPlatform(realPlatform)
  })

  it('finds the folder owner in another window', () => {
    register(makeHost(['/a']))
    const other = register(makeHost(['/b', '/c']))
    expect(findWorkspaceByRoot('/c')).toBe(other.workspaces[1])
  })

  it('counts a dormant workspace (no view)', () => {
    const host = register(makeHost(['/dormant']))
    expect(host.workspaces[0].view).toBeNull()
    expect(findWorkspaceByRoot('/dormant')).toBe(host.workspaces[0])
  })

  it('returns null for a free folder and ignores the empty view', () => {
    register(makeHost([null, '/a']))
    expect(findWorkspaceByRoot('/free')).toBeNull()
  })

  it('ignores the workspace passed in except, but still sees another with the same folder', () => {
    const host = register(makeHost(['/a']))
    expect(findWorkspaceByRoot('/a', host.workspaces[0])).toBeNull()
    const other = register(makeHost(['/a']))
    expect(findWorkspaceByRoot('/a', host.workspaces[0])).toBe(other.workspaces[0])
  })

  it('ignores a closing window and a destroyed window', () => {
    register(makeHost(['/a'], { closing: true }))
    register(makeHost(['/a'], { destroyed: true }))
    expect(findWorkspaceByRoot('/a')).toBeNull()
  })

  it('trailing slash and . segments do not create another folder', () => {
    const host = register(makeHost(['/a/b']))
    expect(findWorkspaceByRoot('/a/b/')).toBe(host.workspaces[0])
    expect(findWorkspaceByRoot('/a/./b')).toBe(host.workspaces[0])
  })

  it('case and NFC/NFD: equal on macOS, distinct on Linux', () => {
    const host = register(makeHost(['/Users/Café/Proj']))
    const variant = '/users/cafe\u0301/proj'
    setPlatform('darwin')
    expect(findWorkspaceByRoot(variant)).toBe(host.workspaces[0])
    setPlatform('linux')
    expect(findWorkspaceByRoot('/users/café/proj')).toBeNull()
    expect(findWorkspaceByRoot('/Users/Cafe\u0301/Proj')).toBeNull()
  })

  it('on Windows case and backslash do not duplicate the folder', () => {
    const host = register(makeHost(['C:\\Dev\\App']))
    setPlatform('win32')
    expect(findWorkspaceByRoot('c:/dev/app')).toBe(host.workspaces[0])
    expect(findWorkspaceByRoot('c:\\dev\\app\\')).toBe(host.workspaces[0])
    expect(findWorkspaceByRoot('D:\\Dev\\App')).toBeNull()
  })
})
