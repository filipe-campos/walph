import { describe, expect, it } from 'vitest'
import { contextsOf, isFocusLost, startEndedEmpty } from './focusContext'

describe('contextsOf', () => {
  it('recognizes the focus inside the terminal and the editor', () => {
    document.body.innerHTML =
      '<div class="xterm"><textarea id="t"></textarea></div><div class="code-editor"><div class="cm-editor"><div id="e"></div></div></div><div class="diff-editor"><div class="cm-editor"><div id="d"></div></div></div><input id="o" />'
    const get = (id: string): Element => document.getElementById(id)!
    expect(contextsOf(get('t'))).toEqual({
      terminalFocus: true,
      editorFocus: false,
      claudeFocus: false,
      markdownPreviewFocus: false,
      explorerFocus: false
    })
    expect(contextsOf(get('e'))).toEqual({
      terminalFocus: false,
      editorFocus: true,
      claudeFocus: false,
      markdownPreviewFocus: false,
      explorerFocus: false
    })
    expect(contextsOf(get('d'))).toEqual({
      terminalFocus: false,
      editorFocus: false,
      claudeFocus: false,
      markdownPreviewFocus: false,
      explorerFocus: false
    })
    expect(contextsOf(get('o'))).toEqual({
      terminalFocus: false,
      editorFocus: false,
      claudeFocus: false,
      markdownPreviewFocus: false,
      explorerFocus: false
    })
    // The terminal search counts as terminal (⌘F and ⌘\\ still apply there).
    document.body.innerHTML = '<div class="terminal-find"><input id="f" /></div>'
    expect(contextsOf(get('f'))).toEqual({
      terminalFocus: true,
      editorFocus: false,
      claudeFocus: false,
      markdownPreviewFocus: false,
      explorerFocus: false
    })
    document.body.innerHTML = '<div class="claude-panel"><div id="p" contenteditable></div></div>'
    expect(contextsOf(get('p'))).toEqual({
      terminalFocus: false,
      editorFocus: false,
      claudeFocus: true,
      markdownPreviewFocus: false,
      explorerFocus: false
    })
    document.body.innerHTML = '<div class="markdown-preview" tabindex="-1"><a id="l" tabindex="0">x</a></div>'
    expect(contextsOf(get('l'))).toEqual({
      terminalFocus: false,
      editorFocus: false,
      claudeFocus: false,
      markdownPreviewFocus: true,
      explorerFocus: false
    })
    document.body.innerHTML =
      '<div class="tree"><div class="tree-row" id="r" tabindex="0"></div><div class="tree-row editing"><input id="n" /></div></div>'
    expect(contextsOf(get('r')).explorerFocus).toBe(true)
    expect(contextsOf(get('n')).explorerFocus).toBe(false)
    expect(contextsOf(null)).toEqual({
      terminalFocus: false,
      editorFocus: false,
      claudeFocus: false,
      markdownPreviewFocus: false,
      explorerFocus: false
    })
  })
})

describe('isFocusLost', () => {
  it('body, null and a removed node count as lost focus', () => {
    document.body.innerHTML = '<input id="i" />'
    const input = document.getElementById('i')!
    expect(isFocusLost(input)).toBe(false)
    expect(isFocusLost(document.body)).toBe(true)
    expect(isFocusLost(null)).toBe(true)
    input.remove()
    expect(isFocusLost(input)).toBe(true)
  })
})

describe('startEndedEmpty', () => {
  it('only when the opening ends without a conversation', () => {
    expect(startEndedEmpty({ starting: true, conversations: 0 }, { starting: false, conversations: 0 })).toBe(true)
    expect(startEndedEmpty({ starting: true, conversations: 0 }, { starting: false, conversations: 1 })).toBe(false)
    expect(startEndedEmpty({ starting: false, conversations: 0 }, { starting: false, conversations: 0 })).toBe(false)
    expect(startEndedEmpty({ starting: true, conversations: 0 }, { starting: true, conversations: 0 })).toBe(false)
  })
})
