import { describe, expect, it } from 'vitest'
import { resolveShell } from './resolveShell'

describe('resolveShell', () => {
  it('without configuration uses the OS default', () => {
    expect(resolveShell('', 'darwin', '/bin/zsh')).toEqual({ file: '/bin/zsh', args: ['-l'] })
    expect(resolveShell('  ', 'linux', undefined)).toEqual({ file: '/bin/bash', args: ['-l'] })
    expect(resolveShell('', 'win32', undefined)).toEqual({ file: 'powershell.exe', args: [] })
  })

  it('a configured POSIX shell gets -l; an unknown one does not', () => {
    expect(resolveShell('/usr/local/bin/fish', 'darwin', '/bin/zsh')).toEqual({
      file: '/usr/local/bin/fish',
      args: ['-l']
    })
    expect(resolveShell('zsh', 'linux', undefined)).toEqual({ file: 'zsh', args: ['-l'] })
    expect(resolveShell('/opt/bin/nu', 'linux', undefined)).toEqual({ file: '/opt/bin/nu', args: [] })
  })

  it('on Windows never passes -l', () => {
    expect(resolveShell('C:\\Program Files\\Git\\bin\\bash.exe', 'win32', undefined).args).toEqual([])
  })
})
