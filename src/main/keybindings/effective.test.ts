import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMMAND_IDS } from '@shared/commands'
import { getBindings, onBindingsChange, setBindings } from './effective'
import { resolveBindings, type Bindings } from './userKeybindings'

const original = getBindings()
const id = COMMAND_IDS[0]

const withKey = (key: string, when?: string): Bindings => ({ ...original, [id]: [{ key, ...(when ? { when } : {}) }] })

afterEach(() => setBindings(original))

describe('effective shortcuts', () => {
  it('starts with the platform default shortcuts', () => {
    expect(getBindings()).toEqual(resolveBindings(process.platform))
  })

  it('swaps the shortcuts and notifies the listeners', () => {
    const cb = vi.fn()
    const off = onBindingsChange(cb)
    const next = withKey('Ctrl+Alt+F12')
    setBindings(next)
    expect(getBindings()).toBe(next)
    expect(cb).toHaveBeenCalledTimes(1)
    off()
  })

  it('does not notify when the shortcuts are equivalent (same key and when)', () => {
    setBindings(withKey('Ctrl+Alt+F12', 'terminalFocus'))
    const cb = vi.fn()
    const off = onBindingsChange(cb)
    const before = getBindings()
    setBindings(withKey('Ctrl+Alt+F12', 'terminalFocus'))
    expect(cb).not.toHaveBeenCalled()
    expect(getBindings()).toBe(before)
    off()
  })

  it('notifies when only the when changes', () => {
    setBindings(withKey('Ctrl+Alt+F12', 'terminalFocus'))
    const cb = vi.fn()
    const off = onBindingsChange(cb)
    setBindings(withKey('Ctrl+Alt+F12', 'editorFocus'))
    expect(cb).toHaveBeenCalledTimes(1)
    off()
  })

  it('notifies when the number of shortcuts of a command changes', () => {
    setBindings(withKey('Ctrl+Alt+F12'))
    const cb = vi.fn()
    const off = onBindingsChange(cb)
    setBindings({ ...original, [id]: [{ key: 'Ctrl+Alt+F12' }, { key: 'Ctrl+Alt+F11' }] })
    expect(cb).toHaveBeenCalledTimes(1)
    off()
  })

  it('treats a missing command as an empty list', () => {
    setBindings({ ...original, [id]: [] })
    const cb = vi.fn()
    const off = onBindingsChange(cb)
    const { [id]: _removed, ...rest } = original
    setBindings(rest)
    expect(cb).not.toHaveBeenCalled()
    off()
  })

  it('unsubscribing stops the notifications', () => {
    const cb = vi.fn()
    onBindingsChange(cb)()
    setBindings(withKey('Ctrl+Alt+F12'))
    expect(cb).not.toHaveBeenCalled()
  })

  it('a listener that unsubscribes during the notification does not block the others', () => {
    let off = (): void => {}
    const first = vi.fn(() => off())
    const second = vi.fn()
    off = onBindingsChange(first)
    const offSecond = onBindingsChange(second)
    setBindings(withKey('Ctrl+Alt+F12'))
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    offSecond()
  })
})
