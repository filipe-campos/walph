import { describe, expect, it } from 'vitest'
import { defaultKeybinding } from '@shared/commands'
import { normalizeKeybinding, parseUserKeybindings, resolveKeybindings } from './userKeybindings'

describe('normalizeKeybinding (VS Code syntax)', () => {
  it.each([
    ['control+alt+delete', 'linux', 'Ctrl+Alt+Delete'],
    ['command+shift+[', 'darwin', 'Cmd+Shift+['],
    ['ctrl+escape', 'linux', 'Ctrl+Esc'],
    ['alt+f4', 'win32', 'Alt+F4'],
    ['f24', 'linux', 'F24'],
    ['esc', 'linux', 'Esc'],
    ['ctrl+pagedown', 'linux', 'Ctrl+PageDown'],
    ['ctrl+0', 'linux', 'Ctrl+0'],
    ['ctrl+\\', 'linux', 'Ctrl+\\'],
    ['commandorcontrol+s', 'darwin', 'CmdOrCtrl+S'],
    ['  ctrl+k   ctrl+s  ', 'linux', 'Ctrl+K Ctrl+S'],
    ['ctrl+k alt+shift+left', 'linux', 'Ctrl+K Alt+Shift+Left']
  ])('%s (%s) -> %s', (input, platform, expected) => {
    expect(normalizeKeybinding(input, platform)).toEqual({ accelerator: expected })
  })

  it('the modifier order is canonical', () => {
    const a = normalizeKeybinding('shift+alt+ctrl+x', 'linux')
    const b = normalizeKeybinding('ctrl+alt+shift+x', 'linux')
    expect(a).toEqual(b)
  })

  it.each(['ctrl+k ctrl+k ctrl+k', 'f25', 'f0', 'ctrl+ctrl', '   ', 'ctrl+é', 'alt'])(
    'rejects "%s" with a pt-BR message',
    (input) => {
      const result = normalizeKeybinding(input, 'linux')
      expect(result).toHaveProperty('error')
      expect((result as { error: string }).error).toMatch(/[a-zç]/i)
    }
  )

  it('a stroke without a modifier only applies to F1-F24 and Esc; any key applies on the 2nd stroke of a chord', () => {
    expect(normalizeKeybinding('f5', 'linux')).toEqual({ accelerator: 'F5' })
    expect(normalizeKeybinding('esc', 'linux')).toEqual({ accelerator: 'Esc' })
    expect(normalizeKeybinding('shift+f5', 'linux')).toEqual({ accelerator: 'Shift+F5' })
    expect(normalizeKeybinding('x', 'linux')).toHaveProperty('error')
    expect(normalizeKeybinding('ctrl+k x', 'linux')).toEqual({ accelerator: 'Ctrl+K X' })
  })
})

describe('parseUserKeybindings (edge cases)', () => {
  it('-command with an empty key removes; with a valid key keeps the normalized entry', () => {
    const result = parseUserKeybindings(
      '[{"key":"","command":"-editor.save"},{"key":"ctrl+s","command":"-editor.save"}]',
      'linux'
    )
    expect(result).toEqual({
      entries: [
        { key: '', command: '-editor.save' },
        { key: 'Ctrl+S', command: '-editor.save' }
      ],
      warnings: []
    })
  })

  it('an unknown -command and an invalid key in a removal become warnings', () => {
    const result = parseUserKeybindings(
      '[{"key":"","command":"-nao.existe"},{"key":"zzz","command":"-editor.save"}]',
      'linux'
    )
    expect(result).toEqual({
      entries: [],
      warnings: [expect.stringContaining('entrada 1'), expect.stringContaining('entrada 2')]
    })
  })

  it('a valid "when" field is kept (trimmed)', () => {
    const result = parseUserKeybindings(
      '[{"key":"ctrl+alt+t","command":"terminal.new","when":"  editorFocus && !terminalFocus "}]',
      'linux'
    )
    expect(result).toEqual({
      entries: [{ key: 'Ctrl+Alt+T', command: 'terminal.new', when: 'editorFocus && !terminalFocus' }],
      warnings: []
    })
  })

  it('an empty "when" always applies; an invalid or wrongly typed one ignores the entry with a warning', () => {
    expect(parseUserKeybindings('[{"key":"ctrl+alt+t","command":"terminal.new","when":"  "}]', 'linux')).toEqual({
      entries: [{ key: 'Ctrl+Alt+T', command: 'terminal.new' }],
      warnings: []
    })
    for (const when of ['"naoExiste"', '"editorFocus &&"', '1', 'null']) {
      const result = parseUserKeybindings(`[{"key":"ctrl+alt+t","command":"terminal.new","when":${when}}]`, 'linux')
      expect(result, when).toMatchObject({ entries: [] })
      expect('warnings' in result && result.warnings, when).toHaveLength(1)
      expect('warnings' in result && result.warnings[0], when).toContain('when')
    }
  })

  it('"when" in a removal is ignored, with a warning', () => {
    expect(parseUserKeybindings('[{"key":"","command":"-view.git","when":"naoExiste"}]', 'linux')).toEqual({
      entries: [{ key: '', command: '-view.git' }],
      warnings: ['entrada 1: "when" é ignorado em "-view.git" (a remoção vale em qualquer contexto)']
    })
  })

  it('each warning numbers the entry (1-based) and missing or wrongly typed fields are warnings', () => {
    const result = parseUserKeybindings(
      '[{"command":"terminal.new"},{"key":"ctrl+j"},{"key":1,"command":"terminal.new"},[]]',
      'linux'
    )
    if (!('warnings' in result)) throw new Error('expected warnings')
    expect(result.entries).toEqual([])
    expect(result.warnings).toHaveLength(4)
    result.warnings.forEach((w, i) => expect(w).toContain(`entrada ${i + 1}`))
  })

  it('only comments is an empty list; comments and a trailing comma are accepted', () => {
    expect(parseUserKeybindings('// nothing\n', 'linux')).toEqual({ entries: [], warnings: [] })
    expect(parseUserKeybindings('[ /* c */ {"key":"ctrl+alt+t","command":"terminal.new"}, ]', 'linux')).toMatchObject({
      entries: [{ key: 'Ctrl+Alt+T' }]
    })
  })

  it('a syntax error carries line:column', () => {
    expect(parseUserKeybindings('[\n  {"key": }\n]', 'linux')).toEqual({
      error: expect.stringMatching(/linha:coluna 2:/)
    })
  })

  it('uses the platform to translate Cmd', () => {
    const text = '[{"key":"cmd+alt+t","command":"terminal.new"}]'
    expect(parseUserKeybindings(text, 'darwin')).toMatchObject({ entries: [{ key: 'Alt+Cmd+T' }] })
    expect(parseUserKeybindings(text, 'win32')).toMatchObject({ entries: [{ key: 'Alt+Super+T' }] })
  })
})

describe('resolveKeybindings (conflicts)', () => {
  it('-command of a command without a shortcut is harmless', () => {
    const base = resolveKeybindings('linux')
    expect(resolveKeybindings('linux', [{ key: '', command: '-workbench.selectTheme' }])).toEqual(base)
  })

  it("the user steals another command's key, even written another way (case/order)", () => {
    const save = defaultKeybinding('editor.save', 'linux')!
    expect(save).toBeTruthy()
    const map = resolveKeybindings('linux', [{ key: save.toLowerCase(), command: 'terminal.new' }])
    expect(map['terminal.new']).toEqual([save.toLowerCase()])
    expect(map['editor.save']).toBeUndefined()
  })

  it('CmdOrCtrl from the default conflicts with Ctrl on Linux and with Cmd on macOS', () => {
    // Finds a command whose default uses CmdOrCtrl so as not to depend on a specific id.
    const linux = resolveKeybindings('linux', [{ key: 'Ctrl+S', command: 'terminal.new' }])
    expect(linux['editor.save']).toBeUndefined()
    const mac = resolveKeybindings('darwin', [{ key: 'Ctrl+S', command: 'terminal.new' }])
    expect(mac['editor.save']).toEqual([defaultKeybinding('editor.save', 'darwin')])
  })

  it('reassigning the same key to the same command does not remove it', () => {
    const save = defaultKeybinding('editor.save', 'linux')!
    expect(resolveKeybindings('linux', [{ key: save, command: 'editor.save' }])['editor.save']).toEqual([save])
  })

  it('whoever steals can be stolen from later (the last entry wins)', () => {
    const map = resolveKeybindings('linux', [
      { key: 'Ctrl+Alt+9', command: 'terminal.new' },
      { key: 'Ctrl+Alt+9', command: 'terminal.toggle' }
    ])
    expect(map['terminal.toggle']).toEqual(['Ctrl+Alt+9'])
    expect(map['terminal.new']).toBeUndefined()
  })

  it('chords conflict as a whole', () => {
    const map = resolveKeybindings('linux', [
      { key: 'Ctrl+K Ctrl+9', command: 'terminal.new' },
      { key: 'ctrl+k ctrl+9', command: 'terminal.toggle' }
    ])
    expect(map['terminal.new']).toBeUndefined()
    expect(map['terminal.toggle']).toEqual(['ctrl+k ctrl+9'])
  })

  it('an entry with an unknown command is ignored', () => {
    const base = resolveKeybindings('linux')
    expect(resolveKeybindings('linux', [{ key: 'Ctrl+Alt+9', command: 'nao.existe' }])).toEqual(base)
  })
})
