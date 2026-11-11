import { describe, expect, it } from 'vitest'
import { terminalKeySequence, type KeyInput } from './terminalKeys'

const key = (k: string, mods: Partial<KeyInput> = {}): KeyInput => ({
  key: k,
  metaKey: false,
  altKey: false,
  ctrlKey: false,
  shiftKey: false,
  ...mods
})

describe('terminalKeySequence', () => {
  it('maps the Cmd shortcuts on macOS', () => {
    expect(terminalKeySequence(key('Backspace', { metaKey: true }), 'darwin')).toBe('\x15')
    expect(terminalKeySequence(key('ArrowLeft', { metaKey: true }), 'darwin')).toBe('\x01')
    expect(terminalKeySequence(key('ArrowRight', { metaKey: true }), 'darwin')).toBe('\x05')
    expect(terminalKeySequence(key('Delete', { metaKey: true }), 'darwin')).toBe('\x0b')
  })

  it('maps the Option shortcuts on macOS', () => {
    expect(terminalKeySequence(key('ArrowLeft', { altKey: true }), 'darwin')).toBe('\x1bb')
    expect(terminalKeySequence(key('ArrowRight', { altKey: true }), 'darwin')).toBe('\x1bf')
    expect(terminalKeySequence(key('Backspace', { altKey: true }), 'darwin')).toBe('\x17')
  })

  it('requires exact modifiers', () => {
    expect(terminalKeySequence(key('ArrowLeft', { metaKey: true, shiftKey: true }), 'darwin')).toBeNull()
    expect(terminalKeySequence(key('ArrowLeft', { metaKey: true, altKey: true }), 'darwin')).toBeNull()
    expect(terminalKeySequence(key('Backspace', { altKey: true, ctrlKey: true }), 'darwin')).toBeNull()
    expect(terminalKeySequence(key('ArrowLeft'), 'darwin')).toBeNull()
  })

  it('ignores keys without a mapping and other platforms', () => {
    expect(terminalKeySequence(key('a', { metaKey: true }), 'darwin')).toBeNull()
    expect(terminalKeySequence(key('Backspace', { metaKey: true }), 'win32')).toBeNull()
    expect(terminalKeySequence(key('ArrowLeft', { altKey: true }), 'linux')).toBeNull()
  })
})
