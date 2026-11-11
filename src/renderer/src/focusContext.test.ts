import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeApi } from './test/fakeApi'
import type { FocusRegion } from './focusBridge'

const setContext = vi.fn()
const focusEditor = vi.fn()
vi.mock('./components/editor/editorFocus', () => ({ focusEditor: () => focusEditor() }))

type Terminal = { id: string }
let register: (name: FocusRegion, el: HTMLElement) => () => void
const region = (name: FocusRegion, selector: string): void => {
  register(name, document.querySelector<HTMLElement>(selector)!)
}
let store: {
  setState: (p: Record<string, unknown>) => void
}
let stop: () => void

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  setContext.mockReset()
  focusEditor.mockReset()
  installFakeApi({ window: { setContext } })
  document.body.innerHTML =
    '<div class="panel-container"><div class="xterm"><textarea id="t"></textarea></div><button id="p"></button></div><input id="o" />'
  vi.doMock('./store', async () => {
    const { create } = await import('zustand')
    const { subscribeWithSelector } = await import('zustand/middleware')
    type Shape = {
      terminals: Terminal[]
      terminalVisible: boolean
      panelView: string
      editorGroups: { id: string }[]
      claude: { conversations: { id: string }[] }
    }
    const { createSubscribeDiff } = await import('./lib/reactions')
    const useStore = create<Shape>()(
      subscribeWithSelector((): Shape => ({
        terminals: [{ id: 'a' }],
        terminalVisible: true,
        panelView: 'terminal',
        editorGroups: [{ id: 'g1' }, { id: 'g2' }],
        claude: { conversations: [] }
      }))
    )
    return { useStore, subscribeDiff: createSubscribeDiff(useStore) }
  })
  register = (await import('./focusBridge')).registerRegion
  region('panelContainer', '.panel-container')
  store = (await import('./store')).useStore
  const { startFocusContexts } = await import('./focusContext')
  stop = startFocusContexts()
  return () => {
    stop()
    vi.useRealTimers()
  }
})

describe('startFocusContexts', () => {
  it('re-evaluates the context when the panel is hidden with focus on the terminal', () => {
    const textarea = document.getElementById('t') as HTMLElement
    textarea.focus()
    expect(setContext).toHaveBeenCalledWith('terminalFocus', true)
    setContext.mockClear()

    // The editor takes the focus (simulated) and the terminal context is reset.
    focusEditor.mockImplementation(() => document.getElementById('o')!.focus())
    store.setState({ terminalVisible: false })
    vi.runAllTimers()
    expect(focusEditor).toHaveBeenCalled()
    expect(setContext).toHaveBeenCalledWith('terminalFocus', false)
  })

  it('with no editor to focus, releases the xterm focus when the last terminal is removed', () => {
    ;(document.getElementById('t') as HTMLElement).focus()
    setContext.mockClear()
    store.setState({ terminals: [] })
    vi.runAllTimers()
    expect(document.activeElement).toBe(document.body)
    expect(setContext).toHaveBeenCalledWith('terminalFocus', false)
  })

  it('does not touch the focus when the panel stays visible', () => {
    ;(document.getElementById('t') as HTMLElement).focus()
    store.setState({ terminals: [{ id: 'a' }, { id: 'b' }] })
    vi.runAllTimers()
    expect(focusEditor).not.toHaveBeenCalled()
    expect(document.activeElement?.id).toBe('t')
  })

  it('switching the panel view with focus on the terminal moves the focus to the editor', () => {
    ;(document.getElementById('t') as HTMLElement).focus()
    setContext.mockClear()
    focusEditor.mockImplementation(() => document.getElementById('o')!.focus())
    store.setState({ panelView: 'problems' })
    vi.runAllTimers()
    expect(focusEditor).toHaveBeenCalled()
    expect(setContext).toHaveBeenCalledWith('terminalFocus', false)
  })

  it('hiding the panel with focus in Problems/Output moves the focus to the editor', () => {
    store.setState({ panelView: 'problems' })
    vi.runAllTimers()
    ;(document.getElementById('p') as HTMLElement).focus()
    focusEditor.mockReset()
    focusEditor.mockImplementation(() => document.getElementById('o')!.focus())
    store.setState({ terminalVisible: false })
    vi.runAllTimers()
    expect(focusEditor).toHaveBeenCalled()
  })

  it('closing the last Claude session with focus in the box moves the focus to "New conversation"', () => {
    document.body.innerHTML = '<div class="claude-panel"><div id="prompt" tabindex="0"></div></div><input id="o" />'
    region('claudePanel', '.claude-panel')
    store.setState({ claude: { conversations: [{ id: 'c' }] } })
    document.getElementById('prompt')!.focus()
    expect(setContext).toHaveBeenCalledWith('claudeFocus', true)
    setContext.mockClear()

    // The box unmounts (no focusout) and the panel shows the empty state.
    document.querySelector('.claude-panel')!.innerHTML = '<div class="claude-empty"><button id="new"></button></div>'
    region('claudeNewConversation', '#new')
    store.setState({ claude: { conversations: [] } })
    vi.runAllTimers()
    expect(document.activeElement?.id).toBe('new')
    expect(setContext).not.toHaveBeenCalledWith('claudeFocus', false)
  })

  it('with no button in the panel, the focus goes to the editor and claudeFocus is reset', () => {
    document.body.innerHTML = '<div class="claude-panel"><div id="prompt" tabindex="0"></div></div><input id="o" />'
    region('claudePanel', '.claude-panel')
    store.setState({ claude: { conversations: [{ id: 'c' }] } })
    document.getElementById('prompt')!.focus()
    setContext.mockClear()
    focusEditor.mockImplementation(() => document.getElementById('o')!.focus())

    document.querySelector('.claude-panel')!.innerHTML = ''
    store.setState({ claude: { conversations: [] } })
    vi.runAllTimers()
    expect(focusEditor).toHaveBeenCalled()
    expect(setContext).toHaveBeenCalledWith('claudeFocus', false)
  })

  it('closing an editor group with focus inside moves the focus to the editor and resets editorFocus', () => {
    document.body.innerHTML =
      '<div class="editor-group"><div class="code-editor"><div class="cm-editor"><div id="e1" tabindex="0"></div></div></div></div><input id="o" />'
    document.getElementById('e1')!.focus()
    setContext.mockClear()
    focusEditor.mockImplementation(() => document.getElementById('o')!.focus())

    document.querySelector('.editor-group')!.remove()
    store.setState({ editorGroups: [{ id: 'g1' }] })
    vi.runAllTimers()
    expect(focusEditor).toHaveBeenCalled()
    expect(setContext).toHaveBeenCalledWith('editorFocus', false)
  })
})
