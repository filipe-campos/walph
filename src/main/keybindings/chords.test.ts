import { describe, expect, it } from 'vitest'
import { COMMAND_IDS } from '@shared/commands'
import {
  buildChordTable,
  buildSingleTable,
  CHORD_TIMEOUT_MS,
  createChordMatcher,
  isMenuAccelerator,
  matchesStroke,
  parseStroke,
  type KeyInput
} from './chords'
import type { CommandId } from '@shared/commands'
import { defaultBindings, type Binding } from './userKeybindings'
import type { WhenContext } from './when'

function key(k: string, mods: Partial<KeyInput> = {}): KeyInput {
  return {
    type: 'keyDown',
    key: k,
    code: k.length === 1 ? `Key${k.toUpperCase()}` : k,
    control: false,
    alt: false,
    shift: false,
    meta: false,
    ...mods
  }
}

describe('parseStroke', () => {
  it('reads modifiers and key', () => {
    expect(parseStroke('Ctrl+K', 'linux')).toEqual({ key: 'k', ctrl: true, alt: false, shift: false, meta: false })
    expect(parseStroke('Alt+Cmd+S', 'darwin')).toMatchObject({ key: 's', alt: true, meta: true, ctrl: false })
    expect(parseStroke('S', 'linux')).toMatchObject({ key: 's', ctrl: false })
  })
  it('CmdOrCtrl depends on the platform', () => {
    expect(parseStroke('CmdOrCtrl+S', 'darwin').meta).toBe(true)
    expect(parseStroke('CmdOrCtrl+S', 'win32').ctrl).toBe(true)
  })
})

describe('matchesStroke', () => {
  it('requires exactly the same modifiers', () => {
    const ctrlK = parseStroke('Ctrl+K', 'linux')
    expect(matchesStroke(key('k', { control: true }), ctrlK)).toBe(true)
    expect(matchesStroke(key('K', { control: true }), ctrlK)).toBe(true)
    expect(matchesStroke(key('k', { control: true, shift: true }), ctrlK)).toBe(false)
    expect(matchesStroke(key('k'), ctrlK)).toBe(false)
  })
  it('uses code when key changes (another layout)', () => {
    const s = parseStroke('S', 'linux')
    expect(matchesStroke({ ...key('ß'), code: 'KeyS' }, s)).toBe(true)
  })
})

describe('buildChordTable', () => {
  it('only has chords on Windows/Linux (all with the Ctrl+K prefix), none on macOS', () => {
    expect(buildChordTable(COMMAND_IDS, 'darwin')).toEqual([])
    const table = buildChordTable(COMMAND_IDS, 'win32')
    expect(table.map((c) => c.id)).toEqual([
      'workbench.saveAll',
      'editor.splitDown',
      'editor.focusLeftGroup',
      'editor.focusRightGroup',
      'editor.focusAboveGroup',
      'editor.focusBelowGroup',
      'editor.compareWithSaved'
    ])
    for (const chord of table) expect(chord.first).toMatchObject({ key: 'k', ctrl: true, alt: false, shift: false })
  })
})

describe('createChordMatcher', () => {
  const chords = buildChordTable(COMMAND_IDS, 'linux')
  const ctrlK = key('k', { control: true })

  it('Ctrl+K S runs the command', () => {
    const m = createChordMatcher(chords)
    expect(m.handle(ctrlK)).toEqual({ action: 'swallow' })
    expect(m.handle(key('Control'))).toEqual({ action: 'pass' })
    expect(m.handle(key('s'))).toEqual({ action: 'run', id: 'workbench.saveAll' })
    // Once complete, it goes back to normal.
    expect(m.handle(key('s'))).toEqual({ action: 'pass' })
  })

  it('a wrong 2nd stroke is swallowed and ends the chord (typing afterwards neither loses text nor saves all)', () => {
    const m = createChordMatcher(chords)
    m.handle(ctrlK)
    expect(m.handle(key('x'))).toEqual({ action: 'swallow' })
    expect(m.handle(key('s'))).toEqual({ action: 'pass' })
  })

  it('modifiers alone do not end the chord', () => {
    const m = createChordMatcher(chords)
    m.handle(ctrlK)
    expect(m.handle(key('Shift'))).toEqual({ action: 'pass' })
    expect(m.handle(key('s'))).toEqual({ action: 'run', id: 'workbench.saveAll' })
  })

  it('a 2nd stroke with an extra modifier does not match', () => {
    const m = createChordMatcher(chords)
    m.handle(ctrlK)
    expect(m.handle(key('s', { control: true })).action).toBe('swallow')
    expect(m.handle(key('s')).action).toBe('pass')
  })

  it('expires after the timeout', () => {
    let t = 0
    const m = createChordMatcher(chords, () => t)
    m.handle(ctrlK)
    t = CHORD_TIMEOUT_MS + 1
    expect(m.handle(key('s'))).toEqual({ action: 'pass' })
  })

  it('reset cancels the pending chord', () => {
    const m = createChordMatcher(chords)
    m.handle(ctrlK)
    m.reset()
    expect(m.handle(key('s'))).toEqual({ action: 'pass' })
  })

  it('ignores keyUp and keys outside the chord; without chords nothing is intercepted', () => {
    const m = createChordMatcher(chords)
    expect(m.handle({ ...ctrlK, type: 'keyUp' })).toEqual({ action: 'pass' })
    expect(m.handle(key('p', { control: true }))).toEqual({ action: 'pass' })
    expect(createChordMatcher([]).handle(ctrlK)).toEqual({ action: 'pass' })
  })
})

describe('parseStroke with special keys', () => {
  it('Plus becomes the + character', () => {
    expect(parseStroke('CmdOrCtrl+Plus', 'linux')).toMatchObject({ key: '+', ctrl: true })
  })
  it('accepts modifier synonyms', () => {
    expect(parseStroke('Control+Option+Command+Shift+X', 'darwin')).toEqual({
      key: 'x',
      ctrl: true,
      alt: true,
      meta: true,
      shift: true
    })
  })
})

describe('createChordMatcher in extra situations', () => {
  const chords = buildChordTable(COMMAND_IDS, 'linux')
  const ctrlK = key('k', { control: true })

  it('without a pending chord, S alone passes and Ctrl+S passes', () => {
    const m = createChordMatcher(chords)
    expect(m.handle(key('s'))).toEqual({ action: 'pass' })
    expect(m.handle(key('s', { control: true }))).toEqual({ action: 'pass' })
  })

  it('a modifier alone at rest passes', () => {
    const m = createChordMatcher(chords)
    expect(m.handle(key('Control', { control: true }))).toEqual({ action: 'pass' })
  })

  it('exactly at the timeout limit the chord still holds; one ms later it expires', () => {
    let t = 1000
    const m = createChordMatcher(chords, () => t)
    m.handle(ctrlK)
    t += CHORD_TIMEOUT_MS
    expect(m.handle(key('s'))).toEqual({ action: 'run', id: 'workbench.saveAll' })
    m.handle(ctrlK)
    t += CHORD_TIMEOUT_MS + 1
    expect(m.handle(key('s'))).toEqual({ action: 'pass' })
  })

  it('a wrong 2nd stroke ends the chord even within the deadline', () => {
    let t = 0
    const m = createChordMatcher(chords, () => t)
    m.handle(ctrlK)
    t = CHORD_TIMEOUT_MS - 100
    expect(m.handle(key('x')).action).toBe('swallow')
    expect(m.handle(key('s'))).toEqual({ action: 'pass' })
  })

  it('a repeated Ctrl+K counts as a wrong 2nd stroke and ends the chord', () => {
    const m = createChordMatcher(chords)
    m.handle(ctrlK)
    expect(m.handle(ctrlK)).toEqual({ action: 'swallow' })
    expect(m.handle(key('s'))).toEqual({ action: 'pass' })
  })

  it('keyUp during the pending chord passes and does not cancel it', () => {
    const m = createChordMatcher(chords)
    m.handle(ctrlK)
    expect(m.handle({ ...key('k', { control: true }), type: 'keyUp' })).toEqual({ action: 'pass' })
    expect(m.handle(key('s'))).toEqual({ action: 'run', id: 'workbench.saveAll' })
  })

  it('instances are independent (one per window)', () => {
    const a = createChordMatcher(chords)
    const b = createChordMatcher(chords)
    a.handle(ctrlK)
    expect(b.handle(key('s'))).toEqual({ action: 'pass' })
  })
})

describe('buildSingleTable', () => {
  const bindings: Partial<Record<CommandId, string>> = {
    'workbench.reload': 'Ctrl+R',
    'workbench.closeWindow': 'Ctrl+Shift+W',
    'terminal.toggle': 'Ctrl+`',
    'workbench.saveAll': 'Ctrl+K S',
    'view.git': 'Ctrl+Shift+G'
  }
  const bindingOf = (id: CommandId): Binding[] | undefined => (bindings[id] ? [{ key: bindings[id] }] : undefined)
  const ids = (t: { id: CommandId }[]): CommandId[] => t.map((b) => b.id)

  it('ignores chords, commands without a shortcut and those the menu already covers', () => {
    const table = buildSingleTable(COMMAND_IDS, 'linux', bindingOf, (id) => id === 'view.git', false)
    expect(ids(table)).toEqual(expect.arrayContaining(['terminal.toggle']))
    expect(ids(table)).not.toContain('workbench.saveAll')
    expect(ids(table)).not.toContain('view.git')
    expect(ids(table)).not.toContain('editor.save')
  })

  it('skips unavailable commands: the key goes on to the page (Ctrl+R in the packaged app)', () => {
    const packaged = buildSingleTable(COMMAND_IDS, 'linux', bindingOf, () => false, true)
    expect(ids(packaged)).not.toContain('workbench.reload')
    expect(ids(packaged)).not.toContain('workbench.closeWindow')
    const dev = buildSingleTable(COMMAND_IDS, 'linux', bindingOf, () => false, false)
    expect(ids(dev)).toContain('workbench.reload')
    expect(ids(dev)).not.toContain('workbench.closeWindow')
    const mac = buildSingleTable(COMMAND_IDS, 'darwin', bindingOf, () => false, true)
    expect(ids(mac)).toContain('workbench.closeWindow')
  })

  it('buildChordTable also skips unavailable commands', () => {
    const chordOf = (id: CommandId): Binding[] | undefined =>
      id === 'workbench.reload' ? [{ key: 'Ctrl+K R' }] : undefined
    expect(buildChordTable(COMMAND_IDS, 'linux', chordOf, true)).toEqual([])
    expect(buildChordTable(COMMAND_IDS, 'linux', chordOf, false)).toHaveLength(1)
  })
})

describe('createChordMatcher with single strokes', () => {
  const chords = buildChordTable(COMMAND_IDS, 'linux')
  const single = (binding: string | Binding, id: CommandId = 'terminal.toggle'): ReturnType<typeof buildSingleTable> =>
    buildSingleTable(
      [id],
      'linux',
      () => [typeof binding === 'string' ? { key: binding } : binding],
      () => false
    )

  it('a single stroke runs directly', () => {
    const m = createChordMatcher([], undefined, single('Ctrl+J'))
    expect(m.handle(key('j', { control: true }))).toEqual({ action: 'run', id: 'terminal.toggle' })
    expect(m.handle(key('j'))).toEqual({ action: 'pass' })
  })

  it('update() in the middle of a chord drops the pending one and swaps the tables', () => {
    const m = createChordMatcher(chords)
    m.handle(key('k', { control: true }))
    m.update(chords, single('Ctrl+J'))
    expect(m.handle(key('s'))).toEqual({ action: 'pass' })
    expect(m.handle(key('j', { control: true }))).toEqual({ action: 'run', id: 'terminal.toggle' })
    m.update([], [])
    expect(m.handle(key('j', { control: true }))).toEqual({ action: 'pass' })
  })

  it('a chord beats the single stroke with the same 1st stroke', () => {
    const m = createChordMatcher(chords, undefined, single('Ctrl+K'))
    expect(m.handle(key('k', { control: true }))).toEqual({ action: 'swallow' })
    expect(m.handle(key('s'))).toEqual({ action: 'run', id: 'workbench.saveAll' })
  })

  it('accelerator key names (Up, Esc, Space)', () => {
    const m = createChordMatcher(
      [],
      undefined,
      buildSingleTable(
        ['terminal.toggle', 'terminal.new', 'view.git'],
        'linux',
        (id) => [
          {
            key: { 'terminal.toggle': 'Ctrl+Up', 'terminal.new': 'Alt+Esc', 'view.git': 'Ctrl+Space' }[id as string]!
          }
        ],
        () => false
      )
    )
    expect(m.handle(key('ArrowUp', { control: true }))).toEqual({ action: 'run', id: 'terminal.toggle' })
    expect(m.handle(key('Escape', { alt: true }))).toEqual({ action: 'run', id: 'terminal.new' })
    expect(m.handle(key(' ', { control: true }))).toEqual({ action: 'run', id: 'view.git' })
  })

  it('punctuation matches by code (Ctrl+Shift+` arrives as ~)', () => {
    const m = createChordMatcher([], undefined, single('Ctrl+Shift+`', 'terminal.new'))
    const input = { ...key('~', { control: true, shift: true }), code: 'Backquote' }
    expect(m.handle(input)).toEqual({ action: 'run', id: 'terminal.new' })
    expect(m.handle({ ...input, code: 'Digit1' })).toEqual({ action: 'pass' })
  })
})

describe('terminal shortcuts', () => {
  const single = (key: string, id: CommandId): ReturnType<typeof buildSingleTable> =>
    buildSingleTable(
      [id],
      'linux',
      () => [{ key }],
      () => false
    )
  it('Ctrl+Shift+5 matches by code (the key becomes % with Shift)', () => {
    const m = createChordMatcher([], undefined, single('Ctrl+Shift+5', 'terminal.split'))
    const input = { ...key('%', { control: true, shift: true }), code: 'Digit5' }
    expect(m.handle(input)).toEqual({ action: 'run', id: 'terminal.split' })
    expect(m.handle({ ...input, code: 'Digit6' })).toEqual({ action: 'pass' })
  })

  it('Cmd+\\ matches by key and by code', () => {
    const m = createChordMatcher([], undefined, single('Cmd+\\', 'terminal.split'))
    expect(m.handle({ ...key('\\', { meta: true }), code: 'Backslash' })).toEqual({
      action: 'run',
      id: 'terminal.split'
    })
  })

  it('the terminal.split default only fires with terminalFocus, on each platform', () => {
    for (const platform of ['darwin', 'linux', 'win32']) {
      const table = buildSingleTable(
        COMMAND_IDS,
        platform,
        (id) => defaultBindings(platform)[id],
        () => true
      )
      const hit = table.find((b) => b.id === 'terminal.split')
      expect(hit?.when).toEqual({ type: 'key', key: 'terminalFocus' })
      const input =
        platform === 'darwin'
          ? { ...key('\\', { meta: true }), code: 'Backslash' }
          : { ...key('%', { control: true, shift: true }), code: 'Digit5' }
      expect(matchesStroke(input, hit!.stroke)).toBe(true)
    }
  })
})

describe('shortcuts with when', () => {
  const ctrlK = key('k', { control: true })
  let context: WhenContext = {}
  const chords = buildChordTable(COMMAND_IDS, 'linux')
  const matcher = (): ReturnType<typeof createChordMatcher> => createChordMatcher(chords, undefined, [], () => context)

  it('the Save All default (Win/Linux) carries the when !terminalFocus', () => {
    expect(chords.find((c) => c.id === 'workbench.saveAll')?.when).toEqual({
      type: 'not',
      operand: { type: 'key', key: 'terminalFocus' }
    })
  })

  it('a chord with a false when lets the 1st stroke through (Ctrl+K reaches the shell)', () => {
    context = { terminalFocus: true }
    const m = matcher()
    expect(m.handle(ctrlK)).toEqual({ action: 'pass' })
    expect(m.handle(key('s'))).toEqual({ action: 'pass' })
  })

  it('a chord with a true when fires; the context is read on every key', () => {
    context = { terminalFocus: false }
    const m = matcher()
    expect(m.handle(ctrlK)).toEqual({ action: 'swallow' })
    expect(m.handle(key('s'))).toEqual({ action: 'run', id: 'workbench.saveAll' })
    context = { terminalFocus: true }
    expect(m.handle(ctrlK)).toEqual({ action: 'pass' })
  })

  it('focus moving to the terminal between the two strokes cancels the chord', () => {
    context = {}
    const m = matcher()
    expect(m.handle(ctrlK)).toEqual({ action: 'swallow' })
    context = { terminalFocus: true }
    expect(m.handle(key('s'))).toEqual({ action: 'swallow' })
    expect(m.handle(key('s'))).toEqual({ action: 'pass' })
  })

  it('a single stroke with when only runs when true', () => {
    const singles = buildSingleTable(
      ['terminal.toggle'],
      'linux',
      () => [{ key: 'Ctrl+J', when: 'editorFocus && !terminalFocus' }],
      () => false
    )
    const m = createChordMatcher([], undefined, singles, () => context)
    context = { editorFocus: true }
    expect(m.handle(key('j', { control: true }))).toEqual({ action: 'run', id: 'terminal.toggle' })
    context = { editorFocus: true, terminalFocus: true }
    expect(m.handle(key('j', { control: true }))).toEqual({ action: 'pass' })
    context = {}
    expect(m.handle(key('j', { control: true }))).toEqual({ action: 'pass' })
  })

  it('a menu command with when goes into the single-stroke table (the menu cannot be the accelerator)', () => {
    const bindingOf = (): Binding[] => [{ key: 'Ctrl+B', when: '!terminalFocus' }]
    expect(buildSingleTable(['view.toggleSidebar'], 'linux', bindingOf, () => true)).toHaveLength(1)
    expect(
      buildSingleTable(
        ['view.toggleSidebar'],
        'linux',
        () => [{ key: 'Ctrl+B' }],
        () => true
      )
    ).toHaveLength(0)
  })

  it('an invalid when drops the shortcut instead of always applying', () => {
    const bad = (): Binding[] => [{ key: 'Ctrl+J', when: 'naoExiste' }]
    expect(buildSingleTable(['terminal.toggle'], 'linux', bad, () => false)).toEqual([])
    expect(buildChordTable(['workbench.saveAll'], 'linux', () => [{ key: 'Ctrl+K S', when: '&&' }])).toEqual([])
  })
})

describe('menu shortcuts with when', () => {
  const inputs = (id: CommandId, platform: string): Binding[] => {
    const keys: Record<string, Binding> = {
      'workbench.navigateBack': { key: platform === 'darwin' ? 'Ctrl+-' : 'Alt+Left', when: '!terminalFocus' },
      'workbench.navigateForward': {
        key: platform === 'darwin' ? 'Ctrl+Shift+-' : 'Alt+Right',
        when: '!terminalFocus'
      },
      'editor.goToDefinition': { key: 'F12', when: 'editorFocus' }
    }
    return [keys[id]]
  }

  it('Ctrl+Shift+- (macOS) matches by the Minus code even with the key changed by Shift', () => {
    const singles = buildSingleTable(
      ['workbench.navigateForward'],
      'darwin',
      (id) => inputs(id, 'darwin'),
      () => true
    )
    // `skip` true (it has a menu item) and it still goes in: the `when` prevents the menu accelerator.
    expect(singles).toHaveLength(1)
    const m = createChordMatcher(
      [],
      () => 0,
      singles,
      () => ({})
    )
    expect(m.handle({ ...key('_', { control: true, shift: true }), code: 'Minus' })).toEqual({
      action: 'run',
      id: 'workbench.navigateForward'
    })
    expect(m.handle({ ...key('-', { control: true }), code: 'Minus' })).toEqual({ action: 'pass' })
  })

  it('Alt+Left and F12 respect the when', () => {
    const singles = buildSingleTable(
      ['workbench.navigateBack', 'editor.goToDefinition'],
      'linux',
      (id) => inputs(id, 'linux'),
      () => true
    )
    const ctx: WhenContext = { editorFocus: true }
    const m = createChordMatcher(
      [],
      () => 0,
      singles,
      () => ctx
    )
    expect(m.handle(key('ArrowLeft', { alt: true }))).toEqual({ action: 'run', id: 'workbench.navigateBack' })
    expect(m.handle({ ...key('F12'), code: 'F12' })).toEqual({ action: 'run', id: 'editor.goToDefinition' })
    ctx.editorFocus = false
    expect(m.handle({ ...key('F12'), code: 'F12' })).toEqual({ action: 'pass' })
  })
})

describe('Ctrl+T (workspace symbols) outside macOS', () => {
  it("does not steal the shell's Ctrl+T when the terminal has focus", () => {
    const bindings: Binding[] = [{ key: 'Ctrl+T', when: '!terminalFocus' }]
    const singles = buildSingleTable(
      ['workbench.showAllSymbols'],
      'linux',
      () => bindings,
      () => true
    )
    const ctx: WhenContext = { terminalFocus: true }
    const m = createChordMatcher(
      [],
      () => 0,
      singles,
      () => ctx
    )
    expect(m.handle(key('t', { control: true }))).toEqual({ action: 'pass' })
    ctx.terminalFocus = false
    expect(m.handle(key('t', { control: true }))).toEqual({ action: 'run', id: 'workbench.showAllSymbols' })
  })
})

describe('engine with shortcut lists', () => {
  const never = (): boolean => false
  const always = (): boolean => true

  it('the same key in two commands with disjoint whens: the context picks who runs', () => {
    const lists: Partial<Record<CommandId, Binding[]>> = {
      'workbench.closeTab': [{ key: 'Ctrl+W', when: '!claudeFocus' }],
      'claude.closeSession': [{ key: 'Ctrl+W', when: 'claudeFocus' }]
    }
    const singles = buildSingleTable(['workbench.closeTab', 'claude.closeSession'], 'linux', (id) => lists[id], always)
    expect(singles).toHaveLength(2)
    const ctx: WhenContext = {}
    const m = createChordMatcher([], undefined, singles, () => ctx)
    expect(m.handle(key('w', { control: true }))).toEqual({ action: 'run', id: 'workbench.closeTab' })
    ctx.claudeFocus = true
    expect(m.handle(key('w', { control: true }))).toEqual({ action: 'run', id: 'claude.closeSession' })
  })

  it('the real ⌘W defaults: tab outside the Claude panel, session inside', () => {
    const table = defaultBindings('darwin')
    const singles = buildSingleTable(COMMAND_IDS, 'darwin', (id) => table[id], always)
    const ctx: WhenContext = {}
    const m = createChordMatcher([], undefined, singles, () => ctx)
    const cmdW = key('w', { meta: true })
    expect(m.handle(cmdW)).toEqual({ action: 'run', id: 'workbench.closeTab' })
    ctx.claudeFocus = true
    expect(m.handle(cmdW)).toEqual({ action: 'run', id: 'claude.closeSession' })
  })

  it('a command with several shortcuts: all fire; only the 1st without when is the menu accelerator', () => {
    const list: Binding[] = [{ key: 'Cmd+L' }, { key: 'Cmd+Escape' }]
    expect(isMenuAccelerator(list[0], 0)).toBe(true)
    expect(isMenuAccelerator(list[1], 1)).toBe(false)
    expect(isMenuAccelerator({ key: 'Cmd+L', when: '!terminalFocus' }, 0)).toBe(false)
    expect(isMenuAccelerator({ key: 'Ctrl+K S' }, 0)).toBe(false)

    // With a menu item: only the 2nd goes into the table (the 1st belongs to the menu).
    const withMenu = buildSingleTable(['claude.focus'], 'darwin', () => list, always)
    expect(withMenu.map((s) => s.stroke.key)).toEqual(['escape'])
    // Without a menu item: both.
    const withoutMenu = buildSingleTable(['claude.focus'], 'darwin', () => list, never)
    expect(withoutMenu).toHaveLength(2)
    const m = createChordMatcher([], undefined, withoutMenu)
    expect(m.handle(key('l', { meta: true }))).toEqual({ action: 'run', id: 'claude.focus' })
    expect(m.handle(key('Escape', { meta: true }))).toEqual({ action: 'run', id: 'claude.focus' })
  })

  it('a command can contribute several chords', () => {
    const table = buildChordTable(['workbench.saveAll'], 'linux', () => [{ key: 'Ctrl+K S' }, { key: 'Ctrl+K A' }])
    expect(table).toHaveLength(2)
  })

  it('between two active strokes for the same key, the one with when wins', () => {
    const singles = [
      ...buildSingleTable(['terminal.toggle'], 'linux', () => [{ key: 'Ctrl+J' }], never),
      ...buildSingleTable(['terminal.new'], 'linux', () => [{ key: 'Ctrl+J', when: 'editorFocus' }], never)
    ]
    const ctx: WhenContext = { editorFocus: true }
    const m = createChordMatcher([], undefined, singles, () => ctx)
    expect(m.handle(key('j', { control: true }))).toEqual({ action: 'run', id: 'terminal.new' })
    ctx.editorFocus = false
    expect(m.handle(key('j', { control: true }))).toEqual({ action: 'run', id: 'terminal.toggle' })
  })
})
