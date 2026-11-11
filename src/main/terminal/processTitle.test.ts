import { describe, expect, it } from 'vitest'
import { normalizeProcessTitle } from './processTitle'

describe('normalizeProcessTitle', () => {
  it('basename and without the login shell hyphen', () => {
    expect(normalizeProcessTitle('-zsh', 'darwin')).toBe('zsh')
    expect(normalizeProcessTitle('/usr/bin/htop', 'linux')).toBe('htop')
    expect(normalizeProcessTitle('  node ', 'linux')).toBe('node')
  })
  it('removes .exe only on Windows', () => {
    expect(normalizeProcessTitle('C:\\Windows\\System32\\powershell.exe', 'win32')).toBe('powershell')
    expect(normalizeProcessTitle('PWSH.EXE', 'win32')).toBe('PWSH')
    expect(normalizeProcessTitle('app.exe', 'linux')).toBe('app.exe')
  })
  it('empty when no name is left', () => {
    expect(normalizeProcessTitle('', 'linux')).toBe('')
    expect(normalizeProcessTitle('-', 'linux')).toBe('')
  })
})
