import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorView } from '@codemirror/view'
import { installFakeApi } from '../../test/fakeApi'
import { mountEditor, unmountEditors } from '../../test/editorHarness'
import type { LspHost } from './lspHost'
import { lspLinks } from './lspLinks'

const DOC = 'foo.bar baz'

function setup({
  platform = 'linux',
  host = {},
  path = '/r/a.ts'
}: { platform?: 'linux' | 'darwin'; host?: Partial<LspHost>; path?: string | null } = {}) {
  installFakeApi({ platform })
  const editor = mountEditor({ doc: DOC, extensions: [lspLinks('t1')], host, path })
  const posAt = vi.spyOn(editor.view, 'posAtCoords').mockImplementation(({ x }) => x)
  const linked = (): string[] => [...editor.view.dom.querySelectorAll('.cm-lsp-link')].map((el) => el.textContent)
  return { ...editor, posAt, linked }
}

const mouse = (view: EditorView, type: string, init: MouseEventInit = {}): MouseEvent => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 1, clientY: 0, ...init })
  view.contentDOM.dispatchEvent(event)
  return event
}
const key = (view: EditorView, type: 'keydown' | 'keyup', name: string, init: KeyboardEventInit = {}): void => {
  view.contentDOM.dispatchEvent(new KeyboardEvent(type, { key: name, bubbles: true, ...init }))
}

beforeEach(() => {
  installFakeApi()
})

afterEach(() => {
  unmountEditors()
})

describe('Ctrl/⌘-click to go to definition', () => {
  it('Ctrl+move underlines the word under the mouse when the server is ready', () => {
    const { view, linked } = setup()
    mouse(view, 'mousemove', { ctrlKey: true, clientX: 5 })
    expect(linked()).toEqual(['bar'])
  })

  it('without the modifier key the word is not underlined and the previous mark goes away', () => {
    const { view, linked } = setup()
    mouse(view, 'mousemove', { ctrlKey: true, clientX: 1 })
    expect(linked()).toEqual(['foo'])
    mouse(view, 'mousemove', { clientX: 1 })
    expect(linked()).toEqual([])
  })

  it('server missing, not ready or tab without a path: nothing is underlined', () => {
    const variants = [
      { host: { serverFor: () => null } },
      { host: { serverFor: () => ({ id: 's', ready: false }) } },
      { path: null }
    ]
    for (const variant of variants) {
      const { view, linked } = setup(variant)
      mouse(view, 'mousemove', { ctrlKey: true })
      expect(linked()).toEqual([])
      unmountEditors()
    }
  })

  it('a position outside the text does not underline', () => {
    const { view, posAt, linked } = setup()
    posAt.mockReturnValue(null)
    mouse(view, 'mousemove', { ctrlKey: true })
    expect(linked()).toEqual([])
  })

  it('on macOS the key is ⌘, and Ctrl does not count', () => {
    const { view, linked } = setup({ platform: 'darwin' })
    mouse(view, 'mousemove', { ctrlKey: true })
    expect(linked()).toEqual([])
    mouse(view, 'mousemove', { metaKey: true })
    expect(linked()).toEqual(['foo'])
  })

  it('moving the mouse within the same word does not redispatch the decoration', () => {
    const { view } = setup()
    const dispatch = vi.spyOn(view, 'dispatch')
    mouse(view, 'mousemove', { ctrlKey: true, clientX: 1 })
    mouse(view, 'mousemove', { ctrlKey: true, clientX: 2 })
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it('pressing the key with the mouse still underlines the word at the last position and releasing removes it', () => {
    const { view, linked } = setup()
    mouse(view, 'mousemove', { clientX: 10 })
    key(view, 'keydown', 'Control', { ctrlKey: true })
    expect(linked()).toEqual(['baz'])
    key(view, 'keyup', 'Control')
    expect(linked()).toEqual([])
  })

  it('pressing the key without ever moving the mouse does not underline', () => {
    const { view, linked } = setup()
    key(view, 'keydown', 'Control', { ctrlKey: true })
    expect(linked()).toEqual([])
  })

  it('other keys do not touch the mark', () => {
    const { view, linked } = setup()
    mouse(view, 'mousemove', { ctrlKey: true })
    key(view, 'keyup', 'a')
    expect(linked()).toEqual(['foo'])
  })

  it('the mouse leaving the editor and the loss of focus remove the mark and forget the position', () => {
    const { view, linked } = setup()
    mouse(view, 'mousemove', { ctrlKey: true })
    mouse(view, 'mouseleave')
    expect(linked()).toEqual([])
    key(view, 'keydown', 'Control', { ctrlKey: true })
    expect(linked()).toEqual([])

    mouse(view, 'mousemove', { ctrlKey: true })
    expect(linked()).toEqual(['foo'])
    view.contentDOM.dispatchEvent(new FocusEvent('blur'))
    expect(linked()).toEqual([])
  })

  it('editing the document removes the mark', () => {
    const { view, linked } = setup()
    mouse(view, 'mousemove', { ctrlKey: true })
    view.dispatch({ changes: { from: 0, insert: 'x' } })
    expect(linked()).toEqual([])
  })

  it('Ctrl+click moves the cursor to the symbol, calls the host and consumes the event', () => {
    const { view, host, linked } = setup()
    mouse(view, 'mousemove', { ctrlKey: true, clientX: 5 })
    const event = mouse(view, 'mousedown', { ctrlKey: true, clientX: 5, button: 0 })
    expect(event.defaultPrevented).toBe(true)
    expect(host.goToDefinitionAt).toHaveBeenCalledExactlyOnceWith(5)
    expect(view.state.selection.main).toMatchObject({ anchor: 5, empty: true })
    expect(linked()).toEqual([])
  })

  it('a click without the key, another button, no ready server or outside the text does not go to definition', () => {
    const { view, host, posAt } = setup()
    mouse(view, 'mousedown', { button: 0 })
    mouse(view, 'mousedown', { ctrlKey: true, button: 2 })
    posAt.mockReturnValue(null)
    mouse(view, 'mousedown', { ctrlKey: true, button: 0 })
    host.serverFor.mockReturnValue(null)
    posAt.mockImplementation(({ x }) => x)
    mouse(view, 'mousedown', { ctrlKey: true, button: 0 })
    expect(host.goToDefinitionAt).not.toHaveBeenCalled()
  })
})
