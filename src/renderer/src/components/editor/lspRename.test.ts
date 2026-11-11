import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeApi } from '../../test/fakeApi'
import { mountEditor, unmountEditors } from '../../test/editorHarness'
import { askRename, closeRenameBox, lspRename } from './lspRename'

beforeEach(() => {
  installFakeApi()
})

afterEach(() => {
  unmountEditors()
  vi.useRealTimers()
})

function setup(doc = 'const goal = 1') {
  const { view } = mountEditor({ doc, extensions: [lspRename] })
  const input = (): HTMLInputElement | null => view.dom.querySelector<HTMLInputElement>('.lsp-rename-input')
  const press = (key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    input()!.dispatchEvent(event)
    return event
  }
  return { view, input, press }
}

/** Resolves the promise right away with the value seen by the waiter (or `'pending'` if it has not resolved yet). */
async function outcome(promise: Promise<string | null>): Promise<string | null | 'pending'> {
  return Promise.race([promise, Promise.resolve('pending' as const)])
}

describe('embedded rename field', () => {
  it('opens a labeled field prefilled with the current name and focus on it', async () => {
    const { view, input } = setup()
    void askRename(view, 6, 'goal')
    expect(input()!.value).toBe('goal')
    expect(input()!.getAttribute('aria-label')).toBe('Novo nome do símbolo')
    expect(document.activeElement).toBe(input())
    expect(input()!.selectionStart).toBe(0)
    expect(input()!.selectionEnd).toBe(4)
  })

  it('Enter confirms with the name trimmed, closes the field and returns focus to the editor', async () => {
    const { view, input, press } = setup()
    const result = askRename(view, 6, 'goal')
    input()!.value = '  next  '
    expect(press('Enter').defaultPrevented).toBe(true)
    await expect(result).resolves.toBe('next')
    expect(input()).toBeNull()
    expect(document.activeElement).toBe(view.contentDOM)
  })

  it('Enter with a blank field cancels', async () => {
    const { view, input, press } = setup()
    const result = askRename(view, 6, 'goal')
    input()!.value = '   '
    press('Enter')
    await expect(result).resolves.toBeNull()
    expect(input()).toBeNull()
  })

  it('Esc cancels and closes', async () => {
    const { view, input, press } = setup()
    const result = askRename(view, 6, 'goal')
    press('Escape')
    await expect(result).resolves.toBeNull()
    expect(input()).toBeNull()
  })

  it('Enter during composition (IME) does not confirm', async () => {
    const { view, input, press } = setup()
    const result = askRename(view, 6, 'goal')
    press('Enter', { isComposing: true })
    expect(await outcome(result)).toBe('pending')
    expect(input()).not.toBeNull()
  })

  it('the field keys do not reach the editor', () => {
    const { view, press } = setup()
    void askRename(view, 6, 'goal')
    const seen = vi.fn()
    view.dom.addEventListener('keydown', seen)
    press('ArrowLeft')
    expect(seen).not.toHaveBeenCalled()
  })

  it('losing focus cancels', async () => {
    const { view, input } = setup()
    const result = askRename(view, 6, 'goal')
    input()!.dispatchEvent(new FocusEvent('blur'))
    await expect(result).resolves.toBeNull()
    expect(input()).toBeNull()
  })

  it('editing the document invalidates the chosen symbol and cancels', async () => {
    const { view, input } = setup()
    const result = askRename(view, 6, 'goal')
    view.dispatch({ changes: { from: 0, insert: 'x' } })
    await expect(result).resolves.toBeNull()
    expect(input()).toBeNull()
  })

  it('touching only the selection keeps the field open', async () => {
    const { view, input } = setup()
    const result = askRename(view, 6, 'goal')
    view.dispatch({ selection: { anchor: 2 } })
    expect(await outcome(result)).toBe('pending')
    expect(input()).not.toBeNull()
  })

  it('opening a second field cancels the first', async () => {
    const { view, input } = setup()
    const first = askRename(view, 6, 'goal')
    const second = askRename(view, 0, 'const')
    await expect(first).resolves.toBeNull()
    expect(input()!.value).toBe('const')
    input()!.value = 'ok'
    input()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await expect(second).resolves.toBe('ok')
  })

  it('the close effect (hiding the tab) cancels the open request', async () => {
    const { view, input } = setup()
    const result = askRename(view, 6, 'goal')
    view.dispatch({ effects: closeRenameBox })
    await expect(result).resolves.toBeNull()
    expect(input()).toBeNull()
  })

  it('closing without an open field is harmless', () => {
    const { view } = setup()
    expect(() => view.dispatch({ effects: closeRenameBox })).not.toThrow()
  })

  it('after confirming, the scheduled focus attempts do not steal focus from the editor', async () => {
    vi.useFakeTimers()
    const { view, input, press } = setup()
    const result = askRename(view, 6, 'goal')
    press('Enter')
    await result
    await vi.advanceTimersByTimeAsync(100)
    expect(input()).toBeNull()
    expect(document.activeElement).toBe(view.contentDOM)
  })
})
