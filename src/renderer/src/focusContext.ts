// Tells main the focus context (terminal / editor) for the `when` clauses of the shortcuts. Listens to the document
// focus (no keydown) and only sends on change.
import { FOCUS_CONTEXT_KEYS } from '@shared/commands'
import { contextsOf, isFocusLost, startEndedEmpty, type FocusContexts } from './lib/focusContext'
import { focusEditor } from './components/editor/editorFocus'
import { blurRegion, focusRegion, hasFocus } from './focusBridge'
import { subscribeDiff, type State } from './store'
import { createReactionScope } from './lib/reactions'
import { shallow } from 'zustand/shallow'

interface FocusInputs {
  panelMaximized: boolean
  sidebarVisible: boolean
  view: State['view']
  screen: State['screen']
  claudeVisible: boolean
  groupCount: number
  starting: boolean
  conversationCount: number
  terminals: State['terminals']
  terminalVisible: boolean
  panelView: State['panelView']
}

const focusInputs = (s: State): FocusInputs => ({
  panelMaximized: s.panelMaximized,
  sidebarVisible: s.sidebarVisible,
  view: s.view,
  screen: s.screen,
  claudeVisible: s.claudeVisible,
  groupCount: s.editorGroups.length,
  starting: s.claude.starting,
  conversationCount: s.claude.conversations.length,
  terminals: s.terminals,
  terminalVisible: s.terminalVisible,
  panelView: s.panelView
})

/** Wires the focus contexts to main. Returns the disposer. */
export function startFocusContexts(): () => void {
  const scope = createReactionScope()
  // Main starts with everything false (and resets when the page reloads, like this module).
  const sent: FocusContexts = {
    terminalFocus: false,
    editorFocus: false,
    claudeFocus: false,
    markdownPreviewFocus: false,
    explorerFocus: false
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  // Dedicated timer for the refocus when a group disappears: the other branches clear `timer` and would cancel
  // the refocus in the same `set`.
  let groupTimer: ReturnType<typeof setTimeout> | undefined

  const report = (next: FocusContexts): void => {
    for (const key of FOCUS_CONTEXT_KEYS) {
      if (next[key] === sent[key]) continue
      sent[key] = next[key]
      window.api.window.setContext(key, next[key])
    }
  }

  const onFocusIn = (e: FocusEvent): void => report(contextsOf(e.target instanceof Element ? e.target : null))
  const onFocusOut = (e: FocusEvent): void => {
    // Focus moving to another element: the next `focusin` decides.
    if (e.relatedTarget) return
    // The window losing focus keeps the last value (on return, the focus goes back to the same element); focus that
    // fell on `body` inside the active window resets.
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (document.hasFocus()) report(contextsOf(document.activeElement))
    }, 0)
  }

  // Hiding the panel (display:none) or removing the last terminal with focus inside it makes the browser drop the focus
  // without `focusin`/`focusout` (also when switching the panel view): as in VS Code, the focus goes to the editor
  // and the context is re-evaluated right after.
  scope.add(
    subscribeDiff(
      focusInputs,
      (s, prev) => {
        // Maximizing hides the editor (display: none) with focus inside it: moves the focus to the panel, otherwise
        // `editorFocus` would get stuck. In the terminal, `TerminalPanel` focuses xterm right after.
        if (s.panelMaximized && !prev.panelMaximized && hasFocus('editorSlot')) {
          focusRegion('panelTab')
          clearTimeout(timer)
          timer = setTimeout(() => report(contextsOf(document.activeElement)), 0)
        }
        // Hiding the explorer (⌘B, another sidebar view, Containers screen) with focus on the tree also emits no
        // `focusout`: without this `explorerFocus` would get stuck and ⌘V would paste files blindly.
        const explorerHidden = (x: FocusInputs): boolean =>
          !x.sidebarVisible || x.view !== 'explorer' || x.screen !== 'workbench'
        if (explorerHidden(s) && !explorerHidden(prev) && hasFocus('tree')) {
          focusEditor()
          blurRegion('tree')
          clearTimeout(timer)
          timer = setTimeout(() => report(contextsOf(document.activeElement)), 0)
        }
        // Closing the Claude panel with focus in the prompt box (display: none) also drops the focus without an event:
        // goes back to the editor, otherwise the focus context would point to an element that is gone.
        if (!s.claudeVisible && prev.claudeVisible && hasFocus('claudePanel')) {
          focusEditor()
          blurRegion('claudePanel')
          clearTimeout(timer)
          timer = setTimeout(() => report(contextsOf(document.activeElement)), 0)
        }
        // `focusout`: without this `editorFocus` would get stuck. After the commit the focus goes to the active group
        // editor and the context is sent again.
        // and the context is sent again.
        if (s.groupCount < prev.groupCount) {
          clearTimeout(groupTimer)
          groupTimer = setTimeout(() => {
            if (isFocusLost(document.activeElement) && (sent.editorFocus || sent.markdownPreviewFocus)) focusEditor()
            report(contextsOf(document.activeElement))
          }, 0)
        }
        // Closing the last session unmounts the prompt box with focus inside, without `focusout`: without this
        // `claudeFocus` would get stuck (and ⌘W dead). After the commit, the focus goes to the panel "New conversation"
        // or to the editor.
        // The same applies when the "New conversation"/suggestion disappears because `starting` turned on and opening
        // failed (no conversation).
        const startFailed = startEndedEmpty(
          { starting: prev.starting, conversations: prev.conversationCount },
          { starting: s.starting, conversations: s.conversationCount }
        )
        if (s.conversationCount < prev.conversationCount || startFailed) {
          clearTimeout(timer)
          timer = setTimeout(() => {
            if ((sent.claudeFocus || startFailed) && isFocusLost(document.activeElement)) {
              if (!focusRegion('claudeNewConversation')) focusEditor()
            }
            report(contextsOf(document.activeElement))
          }, 0)
        }
        if (
          s.terminals === prev.terminals &&
          s.terminalVisible === prev.terminalVisible &&
          s.panelView === prev.panelView
        )
          return
        const terminalShown = s.terminalVisible && s.panelView === 'terminal' && s.terminals.length > 0
        // Problems and Output also lose the focus when the panel hides (display: none).
        const inPanel = !s.terminalVisible && hasFocus('panelContainer')
        if (terminalShown) return
        if (contextsOf(document.activeElement).terminalFocus || inPanel) {
          focusEditor()
          // No tab to focus: releases the focus of the xterm that is about to disappear.
          if (contextsOf(document.activeElement).terminalFocus && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur()
          }
        }
        // After the React commit (the panel already hidden/unmounted) the real focus rules.
        clearTimeout(timer)
        timer = setTimeout(() => report(contextsOf(document.activeElement)), 0)
      },
      shallow
    )
  )

  document.addEventListener('focusin', onFocusIn)
  document.addEventListener('focusout', onFocusOut)
  scope.add(() => {
    clearTimeout(timer)
    clearTimeout(groupTimer)
    document.removeEventListener('focusin', onFocusIn)
    document.removeEventListener('focusout', onFocusOut)
  })
  return scope.stop
}
