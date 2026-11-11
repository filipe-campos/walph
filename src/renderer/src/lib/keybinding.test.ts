import { describe, expect, it } from 'vitest'
import { formatKeybinding, shortcutLabel } from './keybinding'

describe('formatKeybinding', () => {
  it('uses symbols in Apple order on macOS', () => {
    expect(formatKeybinding('CmdOrCtrl+Shift+P', 'darwin')).toBe('⇧⌘P')
    expect(formatKeybinding('Ctrl+`', 'darwin')).toBe('⌃`')
    expect(formatKeybinding('Alt+Cmd+I', 'darwin')).toBe('⌥⌘I')
    expect(formatKeybinding('CmdOrCtrl+Plus', 'darwin')).toBe('⌘+')
  })
  it('uses spelled-out names outside macOS', () => {
    expect(formatKeybinding('CmdOrCtrl+Shift+P', 'linux')).toBe('Ctrl+Shift+P')
    expect(formatKeybinding('CmdOrCtrl+Plus', 'win32')).toBe('Ctrl++')
    expect(formatKeybinding('F11', 'win32')).toBe('F11')
  })

  it('sorts the modifiers as ⌃⌥⇧⌘ regardless of the input order', () => {
    expect(formatKeybinding('Cmd+Shift+Alt+Ctrl+K', 'darwin')).toBe('⌃⌥⇧⌘K')
    expect(formatKeybinding('Ctrl+Cmd+F', 'darwin')).toBe('⌃⌘F')
  })
  it('accepts the modifier aliases', () => {
    expect(formatKeybinding('CommandOrControl+S', 'darwin')).toBe('⌘S')
    expect(formatKeybinding('CommandOrControl+S', 'linux')).toBe('Ctrl+S')
    expect(formatKeybinding('CmdOrCtrl+S', 'win32')).toBe('Ctrl+S')
    expect(formatKeybinding('Cmd+S', 'darwin')).toBe('⌘S')
    expect(formatKeybinding('Control+S', 'darwin')).toBe('⌃S')
    expect(formatKeybinding('Control+S', 'win32')).toBe('Ctrl+S')
    expect(formatKeybinding('Option+S', 'darwin')).toBe('⌥S')
    expect(formatKeybinding('Option+S', 'linux')).toBe('Alt+S')
  })
  it('formats Plus, backtick and function keys', () => {
    expect(formatKeybinding('CmdOrCtrl+Plus', 'linux')).toBe('Ctrl++')
    expect(formatKeybinding('Ctrl+Shift+`', 'linux')).toBe('Ctrl+Shift+`')
    expect(formatKeybinding('Ctrl+Shift+`', 'darwin')).toBe('⌃⇧`')
    expect(formatKeybinding('F11', 'darwin')).toBe('F11')
    expect(formatKeybinding('Shift+F5', 'linux')).toBe('Shift+F5')
    expect(formatKeybinding('Alt+F4', 'win32')).toBe('Alt+F4')
  })
  it('accepts a trailing "+" as the Plus key', () => {
    expect(formatKeybinding('CmdOrCtrl++', 'darwin')).toBe('⌘+')
    expect(formatKeybinding('CmdOrCtrl++', 'win32')).toBe('Ctrl++')
  })
  it('uppercases letters and keeps the hyphen', () => {
    expect(formatKeybinding('CmdOrCtrl+-', 'darwin')).toBe('⌘-')
    expect(formatKeybinding('ctrl+a', 'linux')).toBe('Ctrl+A')
  })
  it('uses Ctrl, Alt, Shift, Meta in that order outside macOS', () => {
    expect(formatKeybinding('Meta+Shift+Alt+Ctrl+K', 'linux')).toBe('Ctrl+Alt+Shift+Meta+K')
  })
  it('formats chords keystroke by keystroke', () => {
    expect(formatKeybinding('Ctrl+K S', 'win32')).toBe('Ctrl+K S')
    expect(formatKeybinding('Ctrl+K S', 'linux')).toBe('Ctrl+K S')
    expect(formatKeybinding('CmdOrCtrl+K CmdOrCtrl+S', 'darwin')).toBe('⌘K ⌘S')
    expect(formatKeybinding('CmdOrCtrl+K CmdOrCtrl+S', 'linux')).toBe('Ctrl+K Ctrl+S')
  })
})

describe('shortcutLabel', () => {
  it('before the first snapshot uses the default shortcut', () => {
    expect(shortcutLabel(null, 'editor.save', 'linux')).toBe('Ctrl+S')
    expect(shortcutLabel(null, 'editor.save', 'darwin')).toBe('⌘S')
  })
  it('uses the keybindings.json shortcut', () => {
    expect(shortcutLabel({ 'editor.save': ['CmdOrCtrl+Alt+S'] }, 'editor.save', 'linux')).toBe('Ctrl+Alt+S')
  })
  it('shows the first shortcut of the list', () => {
    expect(shortcutLabel({ 'claude.focus': ['CmdOrCtrl+L', 'CmdOrCtrl+Escape'] }, 'claude.focus', 'linux')).toBe(
      'Ctrl+L'
    )
  })
  it('empty list = no shortcut', () => {
    expect(shortcutLabel({ 'editor.save': [] }, 'editor.save', 'linux')).toBe('')
  })
  it('a command outside the map has no shortcut', () => {
    expect(shortcutLabel({}, 'editor.save', 'linux')).toBe('')
  })
})
