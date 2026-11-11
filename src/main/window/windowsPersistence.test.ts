import type { BaseWindow } from 'electron'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => state.userData },
  BaseWindow: { getFocusedWindow: () => null }
}))

import { registerHost, unregisterHost, type Host, type Workspace } from './windowState'
import { readSavedWindows, saveWindowsNow } from './windowsPersistence'

const file = (): string => join(state.userData, 'windows.json')

function makeHost(
  workspaces: Array<{ root: string | null; branch?: string | null; muted?: boolean }>,
  activeIndex: number,
  bounds = { x: 10, y: 20, width: 900, height: 600 },
  maximized = false
): Host {
  const host = {
    win: {
      isDestroyed: () => false,
      getNormalBounds: () => bounds,
      isMaximized: () => maximized
    } as unknown as BaseWindow,
    workspaces: [] as Workspace[],
    activeId: `w${activeIndex}`,
    closing: false
  } as Host
  host.workspaces = workspaces.map(
    (w, i) =>
      ({
        id: `w${i}`,
        root: w.root,
        branch: w.branch ?? null,
        muted: w.muted === true,
        view: null,
        host
      }) as unknown as Workspace
  )
  return host
}

describe('windows.json (write and read)', () => {
  const registered: Host[] = []
  const register = (host: Host): Host => {
    registerHost(host)
    registered.push(host)
    return host
  }

  beforeEach(() => {
    state.userData = mkdtempSync(join(tmpdir(), 'walph-windows-'))
  })
  afterEach(() => {
    for (const h of registered.splice(0)) unregisterHost(h)
    rmSync(state.userData, { recursive: true, force: true })
  })

  it('writes v2 and reads back the same state (round trip)', () => {
    register(makeHost([{ root: '/a', branch: 'main' }, { root: '/b', muted: true }, { root: null }], 1))
    register(makeHost([{ root: '/c', branch: 'dev' }], 0, { x: 0, y: 0, width: 800, height: 500 }, true))
    saveWindowsNow()

    const onDisk = JSON.parse(readFileSync(file(), 'utf8'))
    expect(onDisk.version).toBe(2)
    expect(onDisk.windows).toHaveLength(2)

    expect(readSavedWindows()).toEqual([
      {
        workspaces: [
          { root: '/a', branch: 'main' },
          { root: '/b', branch: null, muted: true },
          { root: null, branch: null }
        ],
        active: 1,
        bounds: { x: 10, y: 20, width: 900, height: 600 },
        maximized: false
      },
      {
        workspaces: [{ root: '/c', branch: 'dev' }],
        active: 0,
        bounds: { x: 0, y: 0, width: 800, height: 500 },
        maximized: true
      }
    ])
  })

  it('the dormant workspace is saved with its folder and branch', () => {
    register(makeHost([{ root: '/dormente', branch: 'feat' }], 0))
    saveWindowsNow()
    expect(readSavedWindows()[0].workspaces).toEqual([{ root: '/dormente', branch: 'feat' }])
  })

  it('without live windows it does not overwrite the existing file', () => {
    mkdirSync(state.userData, { recursive: true })
    writeFileSync(file(), '{"version":2,"windows":[]}')
    saveWindowsNow()
    expect(readFileSync(file(), 'utf8')).toBe('{"version":2,"windows":[]}')
  })

  it('reads a v1 file (one folder per window) as v2', () => {
    writeFileSync(
      file(),
      JSON.stringify({
        windows: [{ root: '/a', bounds: { x: 1, y: 2, width: 700, height: 500 }, maximized: true }, { root: null }]
      })
    )
    expect(readSavedWindows()).toEqual([
      {
        workspaces: [{ root: '/a', branch: null }],
        active: 0,
        bounds: { x: 1, y: 2, width: 700, height: 500 },
        maximized: true
      },
      { workspaces: [{ root: null, branch: null }], active: 0, bounds: null, maximized: false }
    ])
  })

  it('a missing, corrupt or invalid-entry file becomes an empty list or discards only the invalid part', () => {
    expect(readSavedWindows()).toEqual([])
    writeFileSync(file(), '{ not json')
    expect(readSavedWindows()).toEqual([])
    writeFileSync(
      file(),
      JSON.stringify({
        version: 2,
        windows: [{ workspaces: [{ root: 'relativa' }, { root: '/ok', branch: 'x' }, 7], active: 2 }, 'lixo']
      })
    )
    expect(readSavedWindows()).toEqual([
      { workspaces: [{ root: '/ok', branch: 'x' }], active: 0, bounds: null, maximized: false }
    ])
  })
})
