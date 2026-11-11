import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { undo } from '@codemirror/commands'
import { installFakeApi } from '../../test/fakeApi'
import { bindDocumentHandlers } from './documentState'
import { forgetDocument, loadDocument } from './documentStore'
import {
  currentState,
  getView,
  hideDocument,
  mountView,
  setActiveGroup,
  showDocument,
  shownTabId,
  unmountView
} from './groupViews'

const indent = { kind: 'spaces', size: 2 } as const
const setDirty = vi.fn<(tabId: string, dirty: boolean) => void>()

// jsdom does not implement the text measurement CodeMirror uses when drawing.
beforeEach(() => {
  const rect = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] })
  Range.prototype.getBoundingClientRect = () => rect
  installFakeApi()
  bindDocumentHandlers({ setDirty, setCursor: () => {}, onScroll: () => {} })
  loadDocument('t', 'abc', indent)
  for (const id of ['gA', 'gB']) mountView(id, document.body.appendChild(document.createElement('div')))
  setActiveGroup('gA')
})

afterEach(() => {
  unmountView('gA')
  unmountView('gB')
  forgetDocument('t')
  setDirty.mockReset()
})

const insertAt = (group: string, from: number, insert: string): void =>
  getView(group)!.dispatch({ changes: { from, insert } })

describe('owner and mirror', () => {
  it('the first view to show the tab is the owner; the second gets the text and the selection', () => {
    expect(showDocument('gA', 't')).toBe(true)
    getView('gA')!.dispatch({ selection: { anchor: 2 } })
    expect(showDocument('gB', 't')).toBe(true)

    expect(shownTabId('gA')).toBe('t')
    expect(shownTabId('gB')).toBe('t')
    expect(getView('gB')!.state.doc.toString()).toBe('abc')
    expect(getView('gB')!.state.selection.main.head).toBe(2)
    expect(currentState('t')).toBe(getView('gA')!.state)
  })

  it('the mirror edit reaches the owner and goes through the listener only once', () => {
    showDocument('gA', 't')
    showDocument('gB', 't')

    insertAt('gB', 3, 'd')

    expect(getView('gA')!.state.doc.toString()).toBe('abcd')
    expect(getView('gB')!.state.doc.toString()).toBe('abcd')
    expect(setDirty.mock.calls).toEqual([['t', true]])
  })

  it('the mirror undo applies to the owner history', () => {
    showDocument('gA', 't')
    showDocument('gB', 't')
    insertAt('gA', 3, 'd')

    expect(undo(getView('gA')!)).toBe(true)

    expect(getView('gB')!.state.doc.toString()).toBe('abc')
  })

  it('hiding the owner with keep promotes the sibling view, which inherits the history', () => {
    showDocument('gA', 't')
    showDocument('gB', 't')
    insertAt('gA', 3, 'd')

    hideDocument('gA', 't', true)

    expect(shownTabId('gA')).toBeNull()
    expect(currentState('t')).toBe(getView('gB')!.state)
    setDirty.mockClear()
    expect(undo(getView('gB')!)).toBe(true)
    expect(getView('gB')!.state.doc.toString()).toBe('abc')
    expect(setDirty).toHaveBeenCalledWith('t', false)
  })

  it('hiding only the mirror keeps the owner alive', () => {
    showDocument('gA', 't')
    showDocument('gB', 't')

    hideDocument('gB', 't', true)

    expect(shownTabId('gB')).toBeNull()
    expect(shownTabId('gA')).toBe('t')
    insertAt('gA', 0, 'x')
    expect(setDirty).toHaveBeenCalledWith('t', true)
  })

  it('hiding the only owner stores the state with the edit', () => {
    showDocument('gA', 't')
    insertAt('gA', 3, 'd')

    hideDocument('gA', 't', true)

    expect(shownTabId('gA')).toBeNull()
    expect(currentState('t')!.doc.toString()).toBe('abcd')
  })

  it('without keep (tab closed) both views drop the tab', () => {
    showDocument('gA', 't')
    showDocument('gB', 't')

    hideDocument('gA', 't', false)

    expect(shownTabId('gA')).toBeNull()
    expect(shownTabId('gB')).toBeNull()
  })

  it('showing a tab not loaded or in a nonexistent view returns false', () => {
    expect(showDocument('gA', 'nunca-carregada')).toBe(false)
    expect(showDocument('nonexistent', 't')).toBe(false)
  })
})
