import { describe, expect, it } from 'vitest'
import {
  cliTarget,
  hasMarker,
  isOsascriptCancel,
  launcherExecutable,
  pathIncludes,
  posixLauncher,
  shellQuote,
  unstableLocationMessage,
  windowsLauncher
} from './launcherScript'

describe('shellQuote', () => {
  it('escapes single quotes', () => expect(shellQuote("/a/it's here")).toBe(`'/a/it'\\''s here'`))
  it('keeps spaces and $ literal', () => expect(shellQuote('/A B/$HOME')).toBe(`'/A B/$HOME'`))
})

describe('posixLauncher', () => {
  const text = posixLauncher("/Applications/Walph's.app/Contents/MacOS/Walph")
  it('has shebang, marker and escaped path', () => {
    expect(text.startsWith('#!/bin/sh\n')).toBe(true)
    expect(hasMarker(text)).toBe(true)
    expect(text).toContain(`APP='/Applications/Walph'\\''s.app/Contents/MacOS/Walph'`)
  })
  it('clears ELECTRON_RUN_AS_NODE and forwards arguments', () => {
    expect(text).toContain('nohup env -u ELECTRON_RUN_AS_NODE "$APP" "$@"')
  })
  it('rejects a line break in the path', () => {
    expect(() => posixLauncher('/a\nrm -rf /')).toThrow()
  })
})

describe('windowsLauncher', () => {
  const text = windowsLauncher('C:\\Users\\a%b\\Walph.exe')
  it('escapes % and uses CRLF', () => {
    expect(text).toContain('start "" "C:\\Users\\a%%b\\Walph.exe" %*')
    expect(text).toContain('\r\n')
    expect(hasMarker(text)).toBe(true)
    expect(text).toContain('set ELECTRON_RUN_AS_NODE=\r\n')
    expect(text).toContain('setlocal')
    expect(text).toContain('if not exist "C:\\Users\\a%%b\\Walph.exe" (')
  })
  it('switches the codepage to UTF-8 before using the path (accented user name)', () => {
    const lines = windowsLauncher('C:\\Users\\João\\Walph.exe').split('\r\n')
    expect(lines.indexOf('chcp 65001 >nul')).toBeGreaterThan(-1)
    expect(lines.indexOf('chcp 65001 >nul')).toBeLessThan(lines.findIndex((l) => l.startsWith('if not exist')))
  })
})

describe('hasMarker', () => {
  it('does not recognize foreign scripts', () => expect(hasMarker('#!/bin/sh\necho hi')).toBe(false))
})

describe('launcherExecutable', () => {
  it('Linux uses APPIMAGE', () => {
    expect(launcherExecutable('linux', { APPIMAGE: '/h/Walph.AppImage' }, '/tmp/.mount_x/walph')).toBe(
      '/h/Walph.AppImage'
    )
  })
  it('others use execPath', () => {
    expect(launcherExecutable('linux', {}, '/opt/Walph/walph')).toBe('/opt/Walph/walph')
    expect(launcherExecutable('darwin', { APPIMAGE: '/x' }, '/A/Walph')).toBe('/A/Walph')
  })
})

describe('cliTarget', () => {
  it('macOS', () =>
    expect(cliTarget('darwin', { home: '/Users/a' })).toEqual({ path: '/usr/local/bin/walph', mayNeedAdmin: true }))
  it('Linux', () => expect(cliTarget('linux', { home: '/home/a' }).path).toBe('/home/a/.local/bin/walph'))
  it('Windows', () => {
    expect(cliTarget('win32', { home: 'C:\\Users\\a', localAppData: 'C:\\Users\\a\\AppData\\Local' }).path).toBe(
      'C:\\Users\\a\\AppData\\Local\\Microsoft\\WindowsApps\\walph.cmd'
    )
    expect(() => cliTarget('win32', { home: 'C:\\Users\\a' })).toThrow()
  })
})

describe('pathIncludes', () => {
  it('ignores a trailing slash', () => expect(pathIncludes('/a:/h/.local/bin/:/b', '/h/.local/bin', ':')).toBe(true))
  it('absent', () => expect(pathIncludes('/a:/b', '/h/.local/bin', ':')).toBe(false))
  it('empty PATH', () => expect(pathIncludes(undefined, '/x', ':')).toBe(false))
})

describe('isOsascriptCancel', () => {
  it('recognizes -128', () => expect(isOsascriptCancel('execution error: User canceled. (-128)')).toBe(true))
  it('other errors do not', () => expect(isOsascriptCancel('execution error: permission denied (1)')).toBe(false))
})

describe('unstableLocationMessage', () => {
  it('rejects DMG and App Translocation on macOS', () => {
    expect(unstableLocationMessage('darwin', '/Volumes/Walph/Walph.app/Contents/MacOS/Walph')).toContain('Aplicativos')
    expect(
      unstableLocationMessage('darwin', '/private/var/AppTranslocation/X/d/Walph.app/Contents/MacOS/Walph')
    ).not.toBeNull()
  })
  it('accepts /Applications and other OSes', () => {
    expect(unstableLocationMessage('darwin', '/Applications/Walph.app/Contents/MacOS/Walph')).toBeNull()
    expect(unstableLocationMessage('linux', '/Volumes/x')).toBeNull()
  })
})
