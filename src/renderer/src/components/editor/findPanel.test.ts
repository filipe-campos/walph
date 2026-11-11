import { searchKeymap, searchPanelOpen, SearchQuery, setSearchQuery } from '@codemirror/search'
import { Compartment, EditorState } from '@codemirror/state'
import { keymap, type EditorView } from '@codemirror/view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setLocale } from '@shared/i18n'
import { installFakeApi } from '../../test/fakeApi'
import { mountEditor, unmountEditors } from '../../test/editorHarness'
import { findExtension } from './findPanel'

beforeEach(() => {
  installFakeApi()
})

afterEach(() => {
  unmountEditors()
  vi.useRealTimers()
  setLocale('pt-BR')
})

const mod = (view: EditorView, key: string, init: KeyboardEventInit = {}): boolean =>
  !view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true, ...init })
  )

const panel = (view: EditorView): HTMLElement => view.dom.querySelector<HTMLElement>('.walph-find')!
const findInput = (view: EditorView): HTMLInputElement =>
  panel(view).querySelector<HTMLInputElement>('input[main-field]')!
const replaceInput = (view: EditorView): HTMLInputElement =>
  panel(view).querySelectorAll<HTMLInputElement>('input.find-input')[1]
const status = (view: EditorView): string => panel(view).querySelector('.find-status')!.textContent
const button = (view: EditorView, label: string): HTMLButtonElement =>
  panel(view).querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!

function type(input: HTMLInputElement, value: string): void {
  input.value = value
  input.dispatchEvent(new Event('input'))
}

function key(target: HTMLElement, name: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

const phrases = new Compartment()

function open(doc: string, extra: { anchor: number; head?: number } = { anchor: 0 }) {
  const editor = mountEditor({
    doc,
    extensions: [findExtension, keymap.of(searchKeymap), phrases.of(EditorState.phrases.of({}))],
    selection: extra
  })
  expect(mod(editor.view, 'f')).toBe(true)
  return editor.view
}

describe('editor find panel', () => {
  it('Mod-f opens the panel with the search field focused and the replace row hidden', () => {
    const view = open('foo bar')
    expect(searchPanelOpen(view.state)).toBe(true)
    expect(document.activeElement).toBe(findInput(view))
    expect(panel(view).getAttribute('role')).toBe('search')
    expect(panel(view).classList.contains('with-replace')).toBe(false)
    expect(replaceInput(view).closest<HTMLElement>('.find-replace-row')!.hidden).toBe(true)
    expect(status(view)).toBe('')
  })

  it('Mod-f with the panel open selects the field text again', () => {
    const view = open('foo')
    const input = findInput(view)
    type(input, 'foo')
    input.setSelectionRange(1, 1)
    mod(view, 'f')
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 3])
  })

  it('typing selects the first match from the cursor and shows "n of total"', () => {
    const view = open('ab ab ab', { anchor: 4 })
    type(findInput(view), 'ab')
    expect(view.state.selection.main).toMatchObject({ from: 6, to: 8 })
    expect(status(view)).toBe('3 de 3')
  })

  it('without a match after the cursor, the search wraps to the start of the document', () => {
    const view = open('ab xx', { anchor: 5 })
    type(findInput(view), 'ab')
    expect(view.state.selection.main).toMatchObject({ from: 0, to: 2 })
    expect(status(view)).toBe('1 de 1')
  })

  it('a term without results shows "Sem resultados" and marks the counter; clearing the term clears everything', () => {
    const view = open('abc')
    type(findInput(view), 'zzz')
    expect(status(view)).toBe('Sem resultados')
    expect(panel(view).querySelector('.find-status')!.classList.contains('none')).toBe(true)
    type(findInput(view), '')
    expect(status(view)).toBe('')
    expect(panel(view).querySelector('.find-status')!.classList.contains('none')).toBe(false)
  })

  it('an invalid regexp marks the field and shows "Expressão inválida" without touching the selection', () => {
    const view = open('a(b')
    button(view, 'Usar expressão regular').click()
    type(findInput(view), '(')
    expect(status(view)).toBe('Expressão inválida')
    expect(findInput(view).classList.contains('invalid')).toBe(true)
    expect(view.state.selection.main.empty).toBe(true)
    type(findInput(view), 'a.b')
    expect(findInput(view).classList.contains('invalid')).toBe(false)
    expect(status(view)).toBe('1 de 1')
  })

  it('the toggles switch aria-pressed, redo the count and return focus to the field', () => {
    const view = open('Foo foo FOO')
    type(findInput(view), 'foo')
    expect(status(view)).toBe('1 de 3')

    const matchCase = button(view, 'Diferenciar maiúsculas e minúsculas')
    expect(matchCase.getAttribute('aria-pressed')).toBe('false')
    matchCase.click()
    expect(matchCase.getAttribute('aria-pressed')).toBe('true')
    expect(status(view)).toBe('? de 1')
    expect(document.activeElement).toBe(findInput(view))

    matchCase.click()
    button(view, 'Palavra inteira').click()
    expect(button(view, 'Palavra inteira').getAttribute('aria-pressed')).toBe('true')
    expect(status(view)).toBe('1 de 3')
  })

  it('whole word does not count matches inside another word', () => {
    const view = open('foo foobar')
    type(findInput(view), 'foo')
    button(view, 'Palavra inteira').click()
    expect(status(view)).toBe('1 de 1')
  })

  it('Enter and Shift+Enter go through the matches, wrapping at the ends', () => {
    const view = open('x x x')
    const input = findInput(view)
    type(input, 'x')
    expect(view.state.selection.main.from).toBe(0)

    expect(key(input, 'Enter').defaultPrevented).toBe(true)
    expect(view.state.selection.main.from).toBe(2)
    key(input, 'Enter')
    key(input, 'Enter')
    expect(view.state.selection.main.from).toBe(0)
    key(input, 'Enter', { shiftKey: true })
    expect(view.state.selection.main.from).toBe(4)
    expect(status(view)).toBe('3 de 3')
  })

  it('Enter during text composition (IME) does not navigate', () => {
    const view = open('x x')
    type(findInput(view), 'x')
    const before = view.state.selection.main.from
    const event = key(findInput(view), 'Enter', { isComposing: true })
    expect(event.defaultPrevented).toBe(false)
    expect(view.state.selection.main.from).toBe(before)
  })

  it('the previous and next buttons navigate', () => {
    const view = open('x x')
    type(findInput(view), 'x')
    button(view, 'Próxima ocorrência (Enter)').click()
    expect(view.state.selection.main.from).toBe(2)
    button(view, 'Ocorrência anterior (Shift+Enter)').click()
    expect(view.state.selection.main.from).toBe(0)
  })

  it('the chevron opens and closes the replace row', () => {
    const view = open('a')
    const expand = button(view, 'Alternar substituição')
    const row = replaceInput(view).closest<HTMLElement>('.find-replace-row')!
    expand.click()
    expect(row.hidden).toBe(false)
    expect(expand.getAttribute('aria-expanded')).toBe('true')
    expect(panel(view).classList.contains('with-replace')).toBe(true)
    expect(expand.firstElementChild!.className).toContain('chevron-down')
    expand.click()
    expect(row.hidden).toBe(true)
    expect(expand.firstElementChild!.className).toContain('chevron-right')
  })

  it('Enter in the replace field replaces the current match and Ctrl+Enter replaces all', () => {
    const view = open('aa aa aa')
    type(findInput(view), 'aa')
    button(view, 'Alternar substituição').click()
    type(replaceInput(view), 'b')

    key(replaceInput(view), 'Enter')
    expect(view.state.doc.toString()).toBe('b aa aa')

    key(replaceInput(view), 'Enter', { ctrlKey: true })
    expect(view.state.doc.toString()).toBe('b b b')
  })

  it('the replace and replace all buttons act on the document', () => {
    const view = open('aa aa')
    type(findInput(view), 'aa')
    button(view, 'Alternar substituição').click()
    type(replaceInput(view), 'z')
    panel(view).querySelectorAll<HTMLButtonElement>('button[aria-label="Substituir"]')[0].click()
    expect(view.state.doc.toString()).toBe('z aa')
    button(view, 'Substituir tudo').click()
    expect(view.state.doc.toString()).toBe('z z')
  })

  it('Ctrl+H opens directly with the replace row and focus on it', () => {
    const editor = mountEditor({ doc: 'a', extensions: [findExtension] })
    mod(editor.view, 'h')
    expect(searchPanelOpen(editor.view.state)).toBe(true)
    expect(replaceInput(editor.view).closest<HTMLElement>('.find-replace-row')!.hidden).toBe(false)
    expect(document.activeElement).toBe(replaceInput(editor.view))
  })

  it('Ctrl+H with the panel already open expands the replace row', () => {
    const view = open('a')
    mod(view, 'h')
    expect(replaceInput(view).closest<HTMLElement>('.find-replace-row')!.hidden).toBe(false)
    expect(document.activeElement).toBe(replaceInput(view))
  })

  it('the close button closes the panel and returns focus to the editor', () => {
    const view = open('a')
    button(view, 'Fechar (Esc)').click()
    expect(searchPanelOpen(view.state)).toBe(false)
    expect(view.dom.querySelector('.walph-find')).toBeNull()
    expect(document.activeElement).toBe(view.contentDOM)
  })

  it('Esc inside the panel closes through the search keymap', () => {
    const view = open('a')
    key(findInput(view), 'Escape')
    expect(searchPanelOpen(view.state)).toBe(false)
  })

  it('a query changed from outside updates the fields, the toggles and the counter', () => {
    const view = open('Ab ab')
    view.dispatch({
      effects: setSearchQuery.of(new SearchQuery({ search: 'ab', replace: 'q', caseSensitive: true }))
    })
    expect(findInput(view).value).toBe('ab')
    expect(replaceInput(view).value).toBe('q')
    expect(button(view, 'Diferenciar maiúsculas e minúsculas').getAttribute('aria-pressed')).toBe('true')
    expect(status(view)).toBe('? de 1')
  })

  it('moving the selection to another match updates the position without recounting', () => {
    const view = open('x x x')
    type(findInput(view), 'x')
    view.dispatch({ selection: { anchor: 4, head: 5 } })
    expect(status(view)).toBe('3 de 3')
    view.dispatch({ selection: { anchor: 1 } })
    expect(status(view)).toBe('? de 3')
  })

  it('editing the document batches the recount into a single short frame', () => {
    vi.useFakeTimers()
    const view = open('x')
    type(findInput(view), 'x')
    expect(status(view)).toBe('1 de 1')
    view.dispatch({ changes: { from: 1, insert: 'x' } })
    view.dispatch({ changes: { from: 2, insert: 'x' } })
    expect(status(view)).toBe('1 de 1')
    vi.advanceTimersByTime(119)
    expect(status(view)).toBe('1 de 1')
    vi.advanceTimersByTime(1)
    expect(status(view)).toBe('1 de 3')
  })

  it('the count stops at 999 and indicates there are more', () => {
    const view = open('a\n'.repeat(1200))
    type(findInput(view), 'a')
    expect(status(view)).toBe('1 de 999+')
  })

  it('changing the language reapplies the labels and counter of the open panel', () => {
    const view = open('a')
    type(findInput(view), 'zzz')
    setLocale('en')
    view.dispatch({ effects: phrases.reconfigure(EditorState.phrases.of({ x: 'y' })) })
    expect(findInput(view).placeholder).toBe('Find')
    expect(button(view, 'Match Case')).toBeTruthy()
    expect(status(view)).toBe('No results')
  })
})
