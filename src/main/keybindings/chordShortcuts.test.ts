import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'
import { setContext } from './context'
import { getBindings, setBindings } from './effective'
import type { Bindings } from './userKeybindings'

const sent = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('../window/viewDelivery', () => ({
  deliverCommand: (wc: unknown, id: string) => sent(wc, 'app:command', id)
}))
const mainHandler = vi.hoisted(() => vi.fn((..._args: unknown[]) => false))
vi.mock('../window/workspaceCommands', () => ({ runWorkspaceCommandWhenUnresponsive: mainHandler }))

const { installChordShortcuts } = await import('./chordShortcuts')

class FakeWc extends EventEmitter {
  destroyed = false
  isDestroyed(): boolean {
    return this.destroyed
  }
}

const original = getBindings()
const only = (bindings: Bindings): void =>
  setBindings({ ...Object.fromEntries(Object.keys(original).map((k) => [k, []])), ...bindings })

const key = (k: string, mods: Partial<{ control: boolean; shift: boolean; alt: boolean }> = {}) => ({
  type: 'keyDown',
  key: k,
  code: `Key${k.toUpperCase()}`,
  control: false,
  alt: false,
  shift: false,
  meta: false,
  ...mods
})

function press(wc: FakeWc, input: ReturnType<typeof key>): boolean {
  const event = { preventDefault: vi.fn() }
  wc.emit('before-input-event', event, input)
  return event.preventDefault.mock.calls.length > 0
}

let wc: FakeWc
const install = (): void => installChordShortcuts(wc as unknown as WebContents)

beforeEach(() => {
  wc = new FakeWc()
  sent.mockReset()
  mainHandler.mockReset()
  mainHandler.mockReturnValue(false)
})
afterEach(() => setBindings(original))

describe('installChordShortcuts', () => {
  it('a full chord swallows both keys and sends app:command', () => {
    only({ 'workbench.saveAll': [{ key: 'Ctrl+K S' }] })
    install()
    expect(press(wc, key('k', { control: true }))).toBe(true)
    expect(sent).not.toHaveBeenCalled()
    expect(press(wc, key('s'))).toBe(true)
    expect(sent).toHaveBeenCalledWith(wc, 'app:command', 'workbench.saveAll')
  })

  it('keys without a shortcut go on to the page', () => {
    only({ 'workbench.saveAll': [{ key: 'Ctrl+K S' }] })
    install()
    expect(press(wc, key('j', { control: true }))).toBe(false)
    expect(sent).not.toHaveBeenCalled()
  })

  it('a single stroke of a command without a menu item is handled; with a menu item it is left to the menu', () => {
    only({ 'editor.rename': [{ key: 'Ctrl+Alt+F12' }], 'workbench.closeTab': [{ key: 'Ctrl+Alt+F11' }] })
    install()
    const f12 = { ...key('F12', { control: true, alt: true }), code: 'F12' }
    const f11 = { ...key('F11', { control: true, alt: true }), code: 'F11' }
    expect(press(wc, f12)).toBe(true)
    expect(sent).toHaveBeenCalledWith(wc, 'app:command', 'editor.rename')
    expect(press(wc, f11)).toBe(false)
  })

  it("main's fallback handles the command without going through the renderer", () => {
    only({ 'workbench.saveAll': [{ key: 'Ctrl+K S' }] })
    const fallback = mainHandler
    fallback.mockReturnValue(true)
    install()
    press(wc, key('k', { control: true }))
    expect(press(wc, key('s'))).toBe(true)
    expect(fallback).toHaveBeenCalledWith(wc, 'workbench.saveAll')
    expect(sent).not.toHaveBeenCalled()
  })

  it('does not send to an already destroyed webContents, but still swallows the key', () => {
    only({ 'workbench.saveAll': [{ key: 'Ctrl+K S' }] })
    install()
    press(wc, key('k', { control: true }))
    wc.destroyed = true
    expect(press(wc, key('s'))).toBe(true)
    expect(sent).not.toHaveBeenCalled()
  })

  it('the when is evaluated against the context reported by the renderer', () => {
    only({ 'workbench.saveAll': [{ key: 'Ctrl+K S', when: 'editorFocus' }] })
    install()
    expect(press(wc, key('k', { control: true }))).toBe(false)
    setContext(wc, 'editorFocus', true)
    expect(press(wc, key('k', { control: true }))).toBe(true)
    expect(press(wc, key('s'))).toBe(true)
    expect(sent).toHaveBeenCalledTimes(1)
  })

  it('losing focus abandons the pending chord', () => {
    only({ 'workbench.saveAll': [{ key: 'Ctrl+K S' }] })
    install()
    press(wc, key('k', { control: true }))
    wc.emit('blur')
    expect(press(wc, key('s'))).toBe(false)
    expect(sent).not.toHaveBeenCalled()
  })

  it('reloading the page resets the context and the pending chord', () => {
    only({ 'workbench.saveAll': [{ key: 'Ctrl+K S', when: 'editorFocus' }] })
    install()
    setContext(wc, 'editorFocus', true)
    press(wc, key('k', { control: true }))
    wc.emit('did-navigate')
    expect(press(wc, key('s'))).toBe(false)
    expect(press(wc, key('k', { control: true }))).toBe(false)
  })

  it('rebuilds the tables when the shortcuts change', () => {
    only({ 'workbench.saveAll': [{ key: 'Ctrl+K S' }] })
    install()
    only({ 'workbench.saveAll': [{ key: 'Ctrl+K D' }] })
    press(wc, key('k', { control: true }))
    expect(press(wc, key('s'))).toBe(true)
    expect(sent).not.toHaveBeenCalled()
    press(wc, key('k', { control: true }))
    press(wc, key('d'))
    expect(sent).toHaveBeenCalledWith(wc, 'app:command', 'workbench.saveAll')
  })

  it('destroying the webContents stops listening to shortcut changes', () => {
    only({ 'workbench.saveAll': [{ key: 'Ctrl+K S' }] })
    install()
    wc.emit('destroyed')
    only({ 'workbench.saveAll': [{ key: 'Ctrl+K D' }] })
    press(wc, key('k', { control: true }))
    press(wc, key('s'))
    expect(sent).toHaveBeenCalledTimes(1)
  })
})
