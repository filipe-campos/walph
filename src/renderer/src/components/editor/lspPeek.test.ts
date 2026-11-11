import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorView } from '@codemirror/view'
import type { LspLocation } from '@shared/types'
import { installFakeApi } from '../../test/fakeApi'
import { mountEditor, unmountEditors } from '../../test/editorHarness'
import { lspPeek, openPeek } from './lspPeek'

const range = (line: number, from = 0, to = 3) => ({
  start: { line, character: from },
  end: { line, character: to }
})
const first: LspLocation = { path: '/r/b.ts', range: range(1, 6, 9) }
const second: LspLocation = { path: '/r/c.ts', range: range(0) }
const FILES: Record<string, string[]> = { '/r/b.ts': ['// b', 'const foo = 1'], '/r/c.ts': ['foo()'] }

beforeEach(() => {
  installFakeApi()
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0))
})

afterEach(() => {
  unmountEditors()
  vi.unstubAllGlobals()
})

function setup() {
  const editor = mountEditor({
    doc: 'foo\nbar',
    extensions: [lspPeek()],
    host: { readLines: (path) => Promise.resolve(FILES[path] ?? null) }
  })
  return editor
}

const peek = (view: EditorView): HTMLElement | null => view.dom.querySelector('.lsp-peek')
const press = (target: Element, key: string): void => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}
const settle = () => new Promise((r) => setTimeout(r, 0))

describe('peek', () => {
  it('opens below the line with the target file, the marked line and the list of locations', async () => {
    const { view, host } = setup()
    openPeek(view, { pos: 0, title: 'References of "foo"', locations: [first, second] })
    await settle()
    const dom = peek(view)!
    expect(dom.getAttribute('aria-label')).toBe('Prévia: References of "foo"')
    expect(dom.querySelector('.lsp-peek-file')?.textContent).toBe('b.ts')
    expect(dom.querySelector('.lsp-peek-count')?.textContent).toBe('1 de 2')
    expect(host.readLines).toHaveBeenCalledWith('/r/b.ts')
    expect(dom.querySelector('.lsp-peek-line.target .lsp-peek-code')?.textContent).toBe('const foo = 1')
    expect(dom.querySelector('.lsp-peek-match')?.textContent).toBe('foo')
    expect([...dom.querySelectorAll('.lsp-peek-item-text')].map((e) => e.textContent)).toEqual([
      'const foo = 1',
      'foo()'
    ])
  })

  it('arrows switch the location, Enter opens the chosen one and closes the peek', async () => {
    const { view, host } = setup()
    openPeek(view, { pos: 0, title: 't', locations: [first, second] })
    await settle()
    const dom = peek(view)!
    press(dom, 'ArrowDown')
    expect(dom.querySelector('.lsp-peek-file')?.textContent).toBe('c.ts')
    expect(dom.querySelector('.lsp-peek-item.selected')?.getAttribute('aria-selected')).toBe('true')
    press(dom, 'Enter')
    expect(host.openLocation).toHaveBeenCalledWith(second)
    expect(peek(view)).toBeNull()
  })

  it('Esc closes (in the peek or in the editor) and an unreadable file shows the notice', async () => {
    const { view } = setup()
    openPeek(view, { pos: 0, title: 't', locations: [{ path: '/r/x.ts', range: range(0) }] })
    await settle()
    expect(peek(view)?.querySelector('.lsp-peek-list')).toBeNull()
    expect(peek(view)?.querySelector('.lsp-peek-message')?.textContent).toBe('Não foi possível ler o arquivo.')
    press(peek(view)!, 'Escape')
    expect(peek(view)).toBeNull()
    openPeek(view, { pos: 0, title: 't', locations: [first] })
    press(view.contentDOM, 'Escape')
    expect(peek(view)).toBeNull()
  })

  it('without locations it does not open', () => {
    const { view } = setup()
    openPeek(view, { pos: 0, title: 't', locations: [] })
    expect(peek(view)).toBeNull()
  })
})
