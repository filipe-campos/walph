import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'
import type * as Guards from './evictionGuards'

vi.mock('electron', () => ({}))

const wc = {} as WebContents
let registerEvictionGuard: typeof Guards.registerEvictionGuard
let evictionBlocker: typeof Guards.evictionBlocker

beforeEach(async () => {
  vi.resetModules()
  ;({ registerEvictionGuard, evictionBlocker } = await import('./evictionGuards'))
})

describe('evictionBlocker', () => {
  it('without guards the view can hibernate', () => {
    expect(evictionBlocker(wc)).toBeNull()
  })

  it('returns null when every guard allows', () => {
    registerEvictionGuard('a', () => null)
    registerEvictionGuard('b', () => null)
    expect(evictionBlocker(wc)).toBeNull()
  })

  it('returns the reason of the first guard that holds, without querying the next ones', () => {
    const later = vi.fn(() => 'unsaved' as const)
    registerEvictionGuard('a', () => null)
    registerEvictionGuard('b', () => 'claudeBusy')
    registerEvictionGuard('c', later)
    expect(evictionBlocker(wc)).toBe('claudeBusy')
    expect(later).not.toHaveBeenCalled()
  })

  it('passes the webContents to the guard', () => {
    const guard = vi.fn(() => null)
    registerEvictionGuard('a', guard)
    evictionBlocker(wc)
    expect(guard).toHaveBeenCalledWith(wc)
  })

  it('a guard that throws counts as keeping the view', () => {
    registerEvictionGuard('terminal', () => {
      throw new Error('boom')
    })
    expect(evictionBlocker(wc)).toBe('guardFailed')
  })

  it('a guard that throws holds even with guards that allow after it', () => {
    registerEvictionGuard('claude', () => {
      throw new Error('boom')
    })
    registerEvictionGuard('docker', () => null)
    expect(evictionBlocker(wc)).not.toBeNull()
  })

  it('registering the same name again replaces the guard', () => {
    registerEvictionGuard('a', () => 'unsaved')
    registerEvictionGuard('a', () => null)
    expect(evictionBlocker(wc)).toBeNull()
  })
})
