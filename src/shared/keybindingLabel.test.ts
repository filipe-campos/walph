import { describe, expect, it } from 'vitest'
import { formatKeybinding } from './keybindingLabel'

describe('formatKeybinding', () => {
  it.each([
    ['CmdOrCtrl+Shift+P', '⇧⌘P'],
    ['Ctrl+Alt+Delete', '⌃⌥Delete'],
    ['Cmd+,', '⌘,'],
    ['Alt+Shift+Ctrl+Cmd+A', '⌃⌥⇧⌘A'],
    ['F5', 'F5'],
    ['CmdOrCtrl+Plus', '⌘+'],
    ['CmdOrCtrl++', '⌘+'],
    ['Option+F5', '⌥F5'],
    ['Super+K', '⌘K'],
    ['cmdorctrl+k', '⌘K']
  ])('no macOS: %s -> %s', (accelerator, expected) => {
    expect(formatKeybinding(accelerator, 'darwin')).toBe(expected)
  })

  it.each([
    ['CmdOrCtrl+Shift+P', 'Ctrl+Shift+P'],
    ['Shift+Alt+Ctrl+A', 'Ctrl+Alt+Shift+A'],
    ['Cmd+,', 'Meta+,'],
    ['Super+K', 'Meta+K'],
    ['F5', 'F5'],
    ['Ctrl+Plus', 'Ctrl++'],
    ['Ctrl++', 'Ctrl++'],
    ['Ctrl+`', 'Ctrl+`'],
    ['CommandOrControl+Up', 'Ctrl+Up']
  ])('no Windows/Linux: %s -> %s', (accelerator, expected) => {
    expect(formatKeybinding(accelerator, 'win32')).toBe(expected)
    expect(formatKeybinding(accelerator, 'linux')).toBe(expected)
  })

  it('formats each stroke of a chord and separates them with a space', () => {
    expect(formatKeybinding('CmdOrCtrl+K S', 'linux')).toBe('Ctrl+K S')
    expect(formatKeybinding('CmdOrCtrl+K CmdOrCtrl+S', 'darwin')).toBe('⌘K ⌘S')
  })

  it('ignores leading, trailing and repeated spaces', () => {
    expect(formatKeybinding('  Ctrl+K   s  ', 'linux')).toBe('Ctrl+K S')
  })
})
