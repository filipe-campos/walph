import { describe, expect, it } from 'vitest'
import { defaultKeybinding } from '@shared/commands'
import {
  type Binding,
  bindingKeys,
  normalizeKeybinding,
  parseUserKeybindings,
  resolveBindings,
  resolveKeybindings,
  sameBindingList
} from './userKeybindings'

describe('normalizeKeybinding', () => {
  it.each([
    ['ctrl+shift+p', 'linux', 'Ctrl+Shift+P'],
    ['CTRL+SHIFT+P', 'linux', 'Ctrl+Shift+P'],
    ['cmd+,', 'darwin', 'Cmd+,'],
    ['cmd+,', 'linux', 'Super+,'],
    ['meta+k', 'darwin', 'Cmd+K'],
    ['win+k', 'win32', 'Super+K'],
    ['cmdorctrl+plus', 'linux', 'CmdOrCtrl+Plus'],
    ['ctrl++', 'linux', 'Ctrl+Plus'],
    ['option+f5', 'darwin', 'Alt+F5'],
    ['ctrl+k ctrl+s', 'linux', 'Ctrl+K Ctrl+S'],
    ['Ctrl+K S', 'linux', 'Ctrl+K S'],
    ['ctrl+arrowup', 'linux', 'Ctrl+Up'],
    ['ctrl+`', 'linux', 'Ctrl+`'],
    ['f11', 'linux', 'F11']
  ])('%s (%s) -> %s', (input, platform, expected) => {
    expect(normalizeKeybinding(input, platform)).toEqual({ accelerator: expected })
  })

  it.each(['', 'ctrl+', 'ctrl+shift', 'ctrl+foo', 'ctrl+a+b', 'ctrl+k a b', 'p', 'shift+p'])(
    'rejeita "%s"',
    (input) => {
      expect(normalizeKeybinding(input, 'linux')).toHaveProperty('error')
    }
  )
})

describe('parseUserKeybindings', () => {
  it('reads JSONC with comments and normalizes', () => {
    const text = `[
      // my shortcut
      { "key": "ctrl+alt+t", "command": "terminal.new" },
      { "key": "", "command": "-view.git" },
    ]`
    expect(parseUserKeybindings(text, 'linux')).toEqual({
      entries: [
        { key: 'Ctrl+Alt+T', command: 'terminal.new' },
        { key: '', command: '-view.git' }
      ],
      warnings: []
    })
  })

  it('invalid entries and unknown commands become warnings, one by one', () => {
    const result = parseUserKeybindings(
      '[{"key":"ctrl+x","command":"no.such"},{"key":"zzz","command":"terminal.new"},42,{"key":"ctrl+j","command":"terminal.toggle"}]',
      'linux'
    )
    expect(result).toMatchObject({ entries: [{ key: 'Ctrl+J', command: 'terminal.toggle' }] })
    expect('warnings' in result && result.warnings).toHaveLength(3)
  })

  it('empty is an empty list; bad syntax and a wrong root are file errors', () => {
    expect(parseUserKeybindings('', 'linux')).toEqual({ entries: [], warnings: [] })
    expect(parseUserKeybindings('[{', 'linux')).toHaveProperty('error')
    expect(parseUserKeybindings('{}', 'linux')).toHaveProperty('error')
  })
})

describe('resolveKeybindings', () => {
  it('without entries returns the platform defaults', () => {
    const map = resolveKeybindings('linux')
    expect(map['editor.save']).toEqual([defaultKeybinding('editor.save', 'linux')])
    expect(map['workbench.selectTheme']).toBeUndefined()
  })

  it('following entries of the same command are appended to the first (which stays the main one)', () => {
    const map = resolveKeybindings('linux', [
      { key: 'Ctrl+Alt+1', command: 'workbench.selectTheme' },
      { key: 'Ctrl+Alt+2', command: 'workbench.selectTheme' }
    ])
    expect(map['workbench.selectTheme']).toEqual(['Ctrl+Alt+1', 'Ctrl+Alt+2'])
  })

  it('-command removes the default shortcut; it can be reassigned afterwards', () => {
    expect(resolveKeybindings('linux', [{ key: '', command: '-editor.save' }])['editor.save']).toBeUndefined()
    const map = resolveKeybindings('linux', [
      { key: '', command: '-editor.save' },
      { key: 'Ctrl+Alt+S', command: 'editor.save' }
    ])
    expect(map['editor.save']).toEqual(['Ctrl+Alt+S'])
  })

  it('key already in use: the user wins and the other command loses it (CmdOrCtrl compared by platform)', () => {
    const map = resolveKeybindings('darwin', [{ key: 'Cmd+S', command: 'workbench.selectTheme' }])
    expect(map['workbench.selectTheme']).toEqual(['Cmd+S'])
    expect(map['editor.save']).toBeUndefined()
    // Another platform: Cmd+S is not Ctrl+S, nothing is stolen.
    const linux = resolveKeybindings('linux', [{ key: 'Ctrl+S', command: 'workbench.selectTheme' }])
    expect(linux['editor.save']).toBeUndefined()
  })
})

describe('resolveKeybindings: prefix conflict', () => {
  it("a user chord whose 1st stroke is another command's single stroke takes the other's shortcut", () => {
    // CmdOrCtrl+B (view.toggleSidebar) is the 1st stroke of "Ctrl+B X".
    const result = resolveKeybindings('linux', [{ key: 'Ctrl+B X', command: 'terminal.new' }])
    expect(result['terminal.new']).toEqual(['Ctrl+B X'])
    expect(result['view.toggleSidebar']).toBeUndefined()
  })

  it("a user single stroke equal to the 1st stroke of another command's chord takes the chord", () => {
    // On Linux, workbench.saveAll is "Ctrl+K S".
    const result = resolveKeybindings('linux', [{ key: 'Ctrl+K', command: 'terminal.new' }])
    expect(result['terminal.new']).toEqual(['Ctrl+K'])
    expect(result['workbench.saveAll']).toBeUndefined()
  })

  it('two chords with the same 1st stroke coexist', () => {
    const result = resolveKeybindings('linux', [{ key: 'Ctrl+K T', command: 'terminal.new' }])
    expect(result['terminal.new']).toEqual(['Ctrl+K T'])
    expect(result['workbench.saveAll']).toEqual(['Ctrl+K S'])
  })

  it('CmdOrCtrl is resolved by platform in the comparison', () => {
    const result = resolveKeybindings('darwin', [{ key: 'Cmd+B X', command: 'terminal.new' }])
    expect(result['view.toggleSidebar']).toBeUndefined()
  })
})

describe('normalizeKeybinding with a prototype property name', () => {
  it.each(['ctrl+constructor', 'ctrl+tostring', 'ctrl+__proto__'])('"%s" is rejected', (input) => {
    expect(normalizeKeybinding(input, 'linux')).toHaveProperty('error')
  })
})

describe('resolveBindings (when)', () => {
  it("the default carries the command's when (Save All on Win/Linux, not on macOS)", () => {
    expect(resolveBindings('linux')['workbench.saveAll']).toEqual([{ key: 'Ctrl+K S', when: '!terminalFocus' }])
    expect(resolveBindings('win32')['workbench.saveAll']).toEqual([{ key: 'Ctrl+K S', when: '!terminalFocus' }])
    expect(resolveBindings('darwin')['workbench.saveAll']).toEqual([{ key: 'Alt+Cmd+S' }])
    expect(resolveBindings('linux')['editor.save']).toEqual([{ key: 'CmdOrCtrl+S' }])
  })

  it("the user's 1st entry replaces key and when; without when, the default goes away", () => {
    const withWhen = resolveBindings('linux', [{ key: 'Ctrl+J', command: 'workbench.saveAll', when: 'editorFocus' }])
    expect(withWhen['workbench.saveAll']).toEqual([{ key: 'Ctrl+J', when: 'editorFocus' }])
    const without = resolveBindings('linux', [{ key: 'Ctrl+K S', command: 'workbench.saveAll' }])
    expect(without['workbench.saveAll']).toEqual([{ key: 'Ctrl+K S' }])
  })

  it('the same key with disjoint whens: both commands keep it', () => {
    const map = resolveBindings('linux', [
      { key: 'Ctrl+Alt+9', command: 'terminal.new', when: 'terminalFocus' },
      { key: 'Ctrl+Alt+9', command: 'terminal.toggle', when: '!terminalFocus' }
    ])
    expect(map['terminal.new']).toEqual([{ key: 'Ctrl+Alt+9', when: 'terminalFocus' }])
    expect(map['terminal.toggle']).toEqual([{ key: 'Ctrl+Alt+9', when: '!terminalFocus' }])
  })

  it('the same key with overlapping whens: the last one to ask keeps it', () => {
    const map = resolveBindings('linux', [
      { key: 'Ctrl+Alt+9', command: 'terminal.new', when: 'terminalFocus' },
      { key: 'Ctrl+Alt+9', command: 'terminal.toggle', when: 'terminalFocus || editorFocus' }
    ])
    expect(map['terminal.new']).toBeUndefined()
    expect(map['terminal.toggle']).toEqual([{ key: 'Ctrl+Alt+9', when: 'terminalFocus || editorFocus' }])
  })

  it("a user key without when takes the other command's shortcut even if it has a when", () => {
    const map = resolveBindings('linux', [{ key: 'Ctrl+T', command: 'terminal.new' }])
    expect(map['workbench.showAllSymbols']).toBeUndefined()
  })

  it("two default shortcuts of the same command; the user's 1st entry replaces the whole list", () => {
    expect(resolveBindings('darwin')['claude.focus']).toEqual([{ key: 'Cmd+L' }, { key: 'Cmd+Escape' }])
    const map = resolveBindings('darwin', [{ key: 'Cmd+J', command: 'claude.focus' }])
    expect(map['claude.focus']).toEqual([{ key: 'Cmd+J' }])
  })

  it('-id with a key removes only that shortcut; without a key removes all', () => {
    const one = resolveBindings('darwin', [{ key: 'Cmd+L', command: '-claude.focus' }])
    expect(one['claude.focus']).toEqual([{ key: 'Cmd+Escape' }])
    const canonicalForm = resolveBindings('darwin', [{ key: 'command+escape', command: '-claude.focus' }])
    expect(canonicalForm['claude.focus']).toEqual([{ key: 'Cmd+L' }])
    const both = resolveBindings('darwin', [
      { key: 'Cmd+L', command: '-claude.focus' },
      { key: 'Cmd+Escape', command: '-claude.focus' }
    ])
    expect(both['claude.focus']).toBeUndefined()
    expect(resolveBindings('darwin', [{ key: '', command: '-claude.focus' }])['claude.focus']).toBeUndefined()
  })

  it("the user's ⌘W with editorFocus: the Claude session stays, the tab goes (!claudeFocus overlaps editorFocus)", () => {
    const map = resolveBindings('darwin', [{ key: 'cmd+w', command: 'terminal.kill', when: 'editorFocus' }])
    expect(map['claude.closeSession']).toEqual([{ key: 'CmdOrCtrl+W', when: 'claudeFocus' }])
    expect(map['workbench.closeTab']).toBeUndefined()
  })

  it('-id with a key takes over the list: the next entry appends instead of erasing the rest of the defaults', () => {
    const map = resolveBindings('darwin', [
      { key: 'Cmd+L', command: '-claude.focus' },
      { key: 'Cmd+J', command: 'claude.focus' }
    ])
    expect(map['claude.focus']).toEqual([{ key: 'Cmd+Escape' }, { key: 'Cmd+J' }])
  })

  it('-id with when warns that the when is ignored', () => {
    const result = parseUserKeybindings('[{"key":"cmd+l","command":"-claude.focus","when":"editorFocus"}]', 'darwin')
    expect('warnings' in result && result.warnings).toHaveLength(1)
    expect(result).toMatchObject({ entries: [{ command: '-claude.focus' }] })
  })

  it('bindingKeys / resolveKeybindings expose only the keys, as a list', () => {
    const keys = resolveKeybindings('linux')
    expect(keys['workbench.saveAll']).toEqual(['Ctrl+K S'])
    expect(resolveKeybindings('darwin')['claude.focus']).toEqual(['Cmd+L', 'Cmd+Escape'])
    expect(bindingKeys(resolveBindings('linux'))).toEqual(keys)
  })
})

describe('sameBindingList', () => {
  const a = { key: 'CommandOrControl+S', when: 'editorFocus' }
  const b: Binding = { key: 'CommandOrControl+K' }

  it('compares order, key and when', () => {
    expect(sameBindingList([a, b], [{ ...a }, { ...b }])).toBe(true)
    expect(sameBindingList([a, b], [b, a])).toBe(false)
    expect(sameBindingList([a], [{ ...a, when: 'x' }])).toBe(false)
    expect(sameBindingList([a], [{ ...a, key: 'F1' }])).toBe(false)
    expect(sameBindingList([a], [a, b])).toBe(false)
  })

  it('treats absent as an empty list', () => {
    expect(sameBindingList(undefined, [])).toBe(true)
    expect(sameBindingList(undefined, undefined)).toBe(true)
    expect(sameBindingList(undefined, [a])).toBe(false)
  })
})
