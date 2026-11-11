import { describe, expect, it } from 'vitest'
import { isVisibleOnSomeDisplay, planRestore, sanitizeBranch, sanitizeWindows, skipOwnedRoots } from './windowsFile'

const bounds = { x: 10, y: 20, width: 800, height: 600 }
const ws = (root: string | null, branch: string | null = null): { root: string | null; branch: string | null } => ({
  root,
  branch
})

describe('sanitizeWindows (v1)', () => {
  it('migrates one folder per window to an active workspace, including an empty window', () => {
    expect(
      sanitizeWindows(
        {
          windows: [
            { root: '/a', bounds, maximized: true },
            { root: null, bounds: null }
          ]
        },
        'linux'
      )
    ).toEqual([
      { workspaces: [ws('/a')], active: 0, bounds, maximized: true },
      { workspaces: [ws(null)], active: 0, bounds: null, maximized: false }
    ])
  })

  it('discards an invalid root, junk and repeated folders', () => {
    const result = sanitizeWindows(
      { windows: [{ root: 'rel' }, 3, null, { root: 7 }, { root: '/a' }, { root: '/a/' }, { root: '/b' }] },
      'linux'
    )
    expect(result.map((w) => w.workspaces[0]?.root)).toEqual(['/a', '/b'])
  })

  it('ignores invalid or too small bounds', () => {
    expect(
      sanitizeWindows({ windows: [{ root: '/a', bounds: { x: 0, y: 0, width: 10, height: 10 } }] })[0]?.bounds
    ).toBeNull()
    expect(
      sanitizeWindows({ windows: [{ root: '/a', bounds: { x: 'a', y: 0, width: 800, height: 600 } }] })[0]?.bounds
    ).toBeNull()
  })

  it('unexpected input becomes an empty list', () => {
    expect(sanitizeWindows(undefined)).toEqual([])
    expect(sanitizeWindows({ windows: 'x' })).toEqual([])
  })
})

describe('sanitizeWindows (v2)', () => {
  it('keeps workspaces, branch and the active index', () => {
    const [w] = sanitizeWindows(
      { version: 2, windows: [{ workspaces: [{ root: '/a', branch: 'main' }, { root: '/b' }], active: 1, bounds }] },
      'linux'
    )
    expect(w).toEqual({ workspaces: [ws('/a', 'main'), ws('/b')], active: 1, bounds, maximized: false })
  })

  it('a folder never repeats in the whole file (not even across windows)', () => {
    const result = sanitizeWindows(
      {
        windows: [
          { workspaces: [{ root: '/a' }, { root: '/a/' }, { root: '/b' }], active: 0 },
          { workspaces: [{ root: '/b' }, { root: '/c' }], active: 0 },
          { workspaces: [{ root: '/a' }], active: 0 }
        ]
      },
      'linux'
    )
    expect(result.map((w) => w.workspaces.map((x) => x.root))).toEqual([['/a', '/b'], ['/c']])
  })

  it('the active one follows its entry even when others before it are discarded', () => {
    const [w] = sanitizeWindows(
      { windows: [{ workspaces: [{ root: 'rel' }, { root: '/a' }, { root: '/b' }], active: 2 }] },
      'linux'
    )
    expect(w?.active).toBe(1)
    expect(w?.workspaces[1]?.root).toBe('/b')
  })

  it('an active index outside the list is clamped; a window without any valid workspace disappears', () => {
    const result = sanitizeWindows(
      {
        windows: [
          { workspaces: [{ root: '/a' }], active: 9 },
          { workspaces: [{ root: 'x' }], active: 0 },
          { workspaces: [] }
        ]
      },
      'linux'
    )
    expect(result).toHaveLength(1)
    expect(result[0]?.active).toBe(0)
  })

  it('only one empty view per window; an invalid branch becomes null', () => {
    const [w] = sanitizeWindows(
      {
        windows: [{ workspaces: [{ root: null }, { root: null }, { root: '/a', branch: 'x'.repeat(300) }], active: 0 }]
      },
      'linux'
    )
    expect(w?.workspaces).toEqual([ws(null), ws('/a')])
  })

  it('limits workspaces per window', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ root: `/p${i}` }))
    expect(sanitizeWindows({ windows: [{ workspaces: many, active: 0 }] }, 'linux')[0]?.workspaces).toHaveLength(50)
  })
})

describe('sanitizeWindows (edge cases)', () => {
  const rootsOf = (windows: ReturnType<typeof sanitizeWindows>): Array<Array<string | null>> =>
    windows.map((w) => w.workspaces.map((x) => x.root))

  it('v1 with an invalid root discards only that window; v1 repeated in another window too', () => {
    const result = sanitizeWindows(
      { windows: [{ root: '' }, { root: 'relativo/x' }, { root: '/a' }, { root: '/a' }, { root: null }] },
      'linux'
    )
    expect(rootsOf(result)).toEqual([['/a'], [null]])
  })

  it('mixed file: v1 window and v2 window do not repeat the same folder', () => {
    const result = sanitizeWindows(
      { windows: [{ root: '/a' }, { workspaces: [{ root: '/a' }, { root: '/b' }], active: 1 }] },
      'linux'
    )
    expect(rootsOf(result)).toEqual([['/a'], ['/b']])
    // The active one pointed to /b (index 1), which became index 0 of the window after /a was discarded.
    expect(result[1]?.active).toBe(0)
  })

  it('a discarded active one falls to the nearest one in the remaining list', () => {
    const [w] = sanitizeWindows({ windows: [{ workspaces: [{ root: '/a' }, { root: 'x' }], active: 1 }] }, 'linux')
    expect(w?.workspaces).toHaveLength(1)
    expect(w?.active).toBe(0)
  })

  it('a negative, fractional, text or missing active index becomes 0 (or the list limit)', () => {
    const list = [{ root: '/a' }, { root: '/b' }]
    for (const active of [-3, 1.5, '1', null, undefined]) {
      expect(sanitizeWindows({ windows: [{ workspaces: list, active }] }, 'linux')[0]?.active).toBe(0)
    }
    expect(sanitizeWindows({ windows: [{ workspaces: list, active: 99 }] }, 'linux')[0]?.active).toBe(1)
  })

  it('a v2 window with only the empty view is kept (Welcome), with active 0', () => {
    expect(sanitizeWindows({ windows: [{ workspaces: [{ root: null }], active: 0 }] }, 'linux')).toEqual([
      { workspaces: [ws(null)], active: 0, bounds: null, maximized: false }
    ])
  })

  it('an empty view in the middle keeps the active index pointing to the right entry', () => {
    const [w] = sanitizeWindows(
      { windows: [{ workspaces: [{ root: '/a' }, { root: null }, { root: null }, { root: '/b' }], active: 3 }] },
      'linux'
    )
    expect(w?.workspaces.map((x) => x.root)).toEqual(['/a', null, '/b'])
    expect(w?.active).toBe(2)
  })

  it('workspace entries that are not objects or have an invalid root are ignored', () => {
    const [w] = sanitizeWindows(
      { windows: [{ workspaces: [7, null, 'x', { root: 3 }, { root: 'rel' }, { root: '' }, { root: '/ok' }] }] },
      'linux'
    )
    expect(w?.workspaces).toEqual([ws('/ok')])
  })

  it('branch: strips controls, trims, limits the length and only holds with a folder', () => {
    const [w] = sanitizeWindows(
      {
        windows: [
          {
            workspaces: [
              { root: '/a', branch: '  feat/x\ny\u0000z  ' },
              { root: '/b', branch: 42 },
              { root: '/c', branch: 'x'.repeat(200) },
              { root: '/d', branch: 'x'.repeat(201) },
              { root: '/e', branch: '   ' },
              { root: null, branch: 'main' }
            ]
          }
        ]
      },
      'linux'
    )
    expect(w?.workspaces.map((x) => x.branch)).toEqual(['feat/x y z', null, 'x'.repeat(200), null, null, null])
  })

  it('muted: only true is read; missing or non-boolean becomes absent', () => {
    const [w] = sanitizeWindows(
      {
        windows: [
          {
            workspaces: [
              { root: '/a', muted: true },
              { root: '/b', muted: 'yes' },
              { root: '/c', muted: false },
              { root: '/d' }
            ]
          }
        ]
      },
      'linux'
    )
    expect(w?.workspaces.map((x) => x.muted === true)).toEqual([true, false, false, false])
    // roundtrip: what comes out of sanitize comes back the same
    expect(sanitizeWindows({ windows: [w] }, 'linux')[0]?.workspaces).toEqual(w?.workspaces)
  })

  it('limits to 20 windows', () => {
    const windows = Array.from({ length: 30 }, (_, i) => ({ workspaces: [{ root: `/w${i}` }], active: 0 }))
    expect(sanitizeWindows({ windows }, 'linux')).toHaveLength(20)
  })

  it('limits to 200 workspaces in the whole file, cutting the window that overflows', () => {
    const windows = Array.from({ length: 5 }, (_, w) => ({
      workspaces: Array.from({ length: 50 }, (_, i) => ({ root: `/w${w}/p${i}` })),
      active: 0
    }))
    const result = sanitizeWindows({ windows }, 'linux')
    expect(result.reduce((n, w) => n + w.workspaces.length, 0)).toBe(200)
    expect(result).toHaveLength(4)
    // The 5th window no longer fits: none of its entries remain.
    expect(rootsOf(result).flat()).not.toContain('/w4/p0')
  })

  it('the limit of 50 per window holds even with the active one beyond it (active clamped to the list)', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ root: `/p${i}` }))
    const [w] = sanitizeWindows({ windows: [{ workspaces: many, active: 70 }] }, 'linux')
    expect(w?.workspaces).toHaveLength(50)
    expect(w?.active).toBe(49)
  })

  it('case and trailing slash: distinct on linux, equal on macOS; NFC/NFD equal only on macOS', () => {
    const dup = { windows: [{ workspaces: [{ root: '/Users/Ana/Proj' }, { root: '/users/ana/proj/' }], active: 0 }] }
    expect(sanitizeWindows(dup, 'linux')[0]?.workspaces).toHaveLength(2)
    expect(sanitizeWindows(dup, 'darwin')[0]?.workspaces).toHaveLength(1)
    const unicode = { windows: [{ workspaces: [{ root: '/p/caf\u00e9' }, { root: '/p/cafe\u0301' }], active: 0 }] }
    expect(sanitizeWindows(unicode, 'linux')[0]?.workspaces).toHaveLength(2)
    expect(sanitizeWindows(unicode, 'darwin')[0]?.workspaces).toHaveLength(1)
  })

  it.skipIf(process.platform !== 'win32')('Windows paths with backslashes repeat regardless of case', () => {
    const [w] = sanitizeWindows(
      { windows: [{ workspaces: [{ root: 'C:\\Proj\\A' }, { root: 'c:\\proj\\a\\' }, { root: 'D:\\B' }] }] },
      'win32'
    )
    expect(w?.workspaces.map((x) => x.root)).toEqual(['C:\\Proj\\A', 'D:\\B'])
  })

  it('maximized only holds with true; bounds are rounded', () => {
    const [a, b] = sanitizeWindows(
      {
        windows: [
          { root: '/a', maximized: 'sim', bounds: { x: 1.4, y: 2.6, width: 800.2, height: 600.7 } },
          { root: '/b', maximized: true }
        ]
      },
      'linux'
    )
    expect(a?.maximized).toBe(false)
    expect(a?.bounds).toEqual({ x: 1, y: 3, width: 800, height: 601 })
    expect(b?.maximized).toBe(true)
  })

  it('junk at the top level becomes an empty list', () => {
    for (const bad of [null, 3, 'x', [], { windows: null }, { windows: {} }]) {
      expect(sanitizeWindows(bad)).toEqual([])
    }
  })
})

describe('sanitizeBranch', () => {
  it('accepts short text, strips controls and rejects the rest', () => {
    expect(sanitizeBranch('feat/x')).toBe('feat/x')
    expect(sanitizeBranch('a\nb')).toBe('a b')
    expect(sanitizeBranch('')).toBeNull()
    expect(sanitizeBranch(3)).toBeNull()
    expect(sanitizeBranch('x'.repeat(201))).toBeNull()
  })
})

describe('planRestore', () => {
  const saved = (workspaces: Array<{ root: string | null; branch: string | null }>, active: number) => ({
    workspaces,
    active,
    bounds: null,
    maximized: false
  })

  it('removes vanished folders and repositions the active one', () => {
    const plan = planRestore(saved([ws('/gone'), ws('/a'), ws('/b')], 2), (r) => r !== '/gone')
    expect(plan.workspaces.map((w) => w.root)).toEqual(['/a', '/b'])
    expect(plan.active).toBe(1)
  })

  it('a vanished active one falls to the nearest neighbor in the list', () => {
    const plan = planRestore(saved([ws('/a'), ws('/gone')], 1), (r) => r !== '/gone')
    expect(plan.active).toBe(0)
  })

  it('with nothing left, gets an empty view', () => {
    const plan = planRestore(saved([ws('/gone')], 0), () => false)
    expect(plan.workspaces).toEqual([ws(null)])
    expect(plan.active).toBe(0)
  })

  it('keeps the order, branch, bounds and maximized; does not change the input', () => {
    const input = {
      workspaces: [ws('/a', 'main'), ws('/gone', 'x'), ws('/b', 'dev')],
      active: 0,
      bounds,
      maximized: true
    }
    const snapshot = structuredClone(input)
    const plan = planRestore(input, (r) => r !== '/gone')
    expect(plan).toEqual({ workspaces: [ws('/a', 'main'), ws('/b', 'dev')], active: 0, bounds, maximized: true })
    expect(input).toEqual(snapshot)
  })

  it('an active one that still exists follows the list shift', () => {
    const plan = planRestore(saved([ws('/gone1'), ws('/gone2'), ws('/a'), ws('/b')], 3), (r) => !r.startsWith('/gone'))
    expect(plan.workspaces.map((w) => w.root)).toEqual(['/a', '/b'])
    expect(plan.active).toBe(1)
  })

  it('an out-of-range active index is clamped to the list', () => {
    expect(planRestore(saved([ws('/a'), ws('/b')], 9), () => true).active).toBe(1)
    expect(planRestore(saved([ws('/a'), ws('/b')], -2), () => true).active).toBe(0)
  })

  it('queries the disk only for folders (the empty view is not checked)', () => {
    const asked: string[] = []
    planRestore(saved([ws(null), ws('/a')], 0), (r) => (asked.push(r), true))
    expect(asked).toEqual(['/a'])
  })

  it('an empty view always survives', () => {
    expect(planRestore(saved([ws(null), ws('/a')], 1), () => false).workspaces).toEqual([ws(null)])
  })
})

describe('isVisibleOnSomeDisplay', () => {
  const screens = [{ x: 0, y: 0, width: 1920, height: 1080 }]

  it('visible inside the monitor', () => {
    expect(isVisibleOnSomeDisplay(bounds, screens)).toBe(true)
  })

  it('outside any monitor', () => {
    expect(isVisibleOnSomeDisplay({ ...bounds, x: 3000 }, screens)).toBe(false)
  })

  it('only a sliver visible does not count', () => {
    expect(isVisibleOnSomeDisplay({ ...bounds, x: 1900 }, screens)).toBe(false)
  })

  it('accepts a secondary monitor with negative coordinates', () => {
    expect(
      isVisibleOnSomeDisplay({ ...bounds, x: -1500 }, [...screens, { x: -1920, y: 0, width: 1920, height: 1080 }])
    ).toBe(true)
  })
})

describe('skipOwnedRoots', () => {
  const win = (roots: Array<string | null>, active = 0) => ({
    workspaces: roots.map((root) => ({ root, branch: null })),
    active,
    bounds: null,
    maximized: false
  })

  it('removes the workspaces whose folder already has an owner', () => {
    const plan = skipOwnedRoots(win(['/a', '/b', '/c'], 1), (r) => r === '/b')
    expect(plan?.workspaces.map((w) => w.root)).toEqual(['/a', '/c'])
  })

  it('discards the window when all folders already have an owner', () => {
    expect(skipOwnedRoots(win(['/a', '/b']), () => true)).toBeNull()
  })

  it('keeps the window that has an empty workspace', () => {
    expect(skipOwnedRoots(win([null]), () => true)?.workspaces).toEqual([{ root: null, branch: null }])
  })
})
