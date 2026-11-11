import { describe, expect, it } from 'vitest'
import type { ClaudeSlashCommand } from '@shared/types'
import {
  HISTORY_IDLE,
  activeSlash,
  applySlash,
  canRecall,
  enterCompletesSlash,
  exactSlashCommand,
  slashMenuApplies,
  filterSlash,
  groupSlash,
  historyDown,
  historyUp,
  insertAtCaret,
  promptKeyAction,
  pushHistory,
  type PromptKey,
  type PromptKeyContext,
  slashQuery,
  promptSegments,
  slashText
} from './claudePrompt'

const cmd = (name: string, scope: ClaudeSlashCommand['scope'] = 'builtin'): ClaudeSlashCommand => ({
  name,
  description: '',
  argumentHint: '',
  scope
})

describe('promptSegments', () => {
  const commands = [cmd('loop'), cmd('review')]
  const marked = (text: string): string[] =>
    promptSegments(text, commands)
      .filter((s) => s.kind === 'command')
      .map((s) => s.text)

  it('marks the first token and known commands in the middle of the text', () => {
    expect(marked('/loop 15m /review now')).toEqual(['/loop', '/review'])
    expect(promptSegments('/loop 15m /review', commands)).toEqual([
      { text: '/loop', kind: 'command' },
      { text: ' 15m ', kind: 'text' },
      { text: '/review', kind: 'command' }
    ])
  })

  it('the first token counts even if unknown (init list still empty)', () => {
    expect(marked('  /clear')).toEqual(['/clear'])
  })

  it('the concatenated spans are always the original text', () => {
    for (const text of ['/loop  15m\n/review x', '\n/loop', 'a /review', '', '/']) {
      expect(
        promptSegments(text, commands)
          .map((s) => s.text)
          .join('')
      ).toBe(text)
    }
  })

  it('paths and slashes inside words stay as text', () => {
    expect(marked('look /tmp and src/loop')).toEqual([])
    expect(marked('run /review/x')).toEqual([])
    expect(promptSegments('no command', commands)).toEqual([{ text: 'no command', kind: 'text' }])
  })
})

describe('slashQuery', () => {
  it('applies to the /xxx token under the cursor', () => {
    expect(slashQuery('/com', 4)).toBe('com')
    expect(slashQuery('/', 1)).toBe('')
    expect(slashQuery('/compact foo', 5)).toBe('compact')
    expect(slashQuery('/compact foo', 10)).toBeNull()
  })
  it('applies in any position, after a space', () => {
    expect(slashQuery('hi /x', 5)).toBe('x')
    expect(slashQuery('/loop 15m /command-2', 20)).toBe('command-2')
    expect(slashQuery('/loop 15m /', 11)).toBe('')
    expect(slashQuery('a\n/b', 4)).toBe('b')
  })
  it('a slash in the middle of a word does not count', () => {
    expect(slashQuery('src/a', 5)).toBeNull()
    expect(slashQuery('https://x.dev', 8)).toBeNull()
    expect(slashQuery('an/other', 8)).toBeNull()
  })
})

describe('activeSlash', () => {
  it('returns the token range, up to the next space', () => {
    expect(activeSlash('/loop 15m /cmd rest', 13)).toEqual({ start: 10, end: 14, query: 'cmd' })
    expect(activeSlash('/ab cd', 2)).toEqual({ start: 0, end: 3, query: 'ab' })
  })
})

describe('applySlash', () => {
  const review = cmd('review')
  it('replaces only the token and keeps the rest of the message', () => {
    const text = '/loop 15m /re'
    const slash = activeSlash(text, text.length)!
    expect(applySlash(text, slash, review)).toEqual({ text: '/loop 15m /review ', caret: 18 })
  })
  it('does not duplicate the space that already exists after the token', () => {
    const text = 'hi /re thanks'
    const slash = activeSlash(text, 6)!
    const next = applySlash(text, slash, review)
    expect(next.text).toBe('hi /review thanks')
    expect(next.caret).toBe(11)
  })
  it('at the start of the text adds the space for the arguments', () => {
    const slash = activeSlash('/r', 2)!
    expect(applySlash('/r', slash, review)).toEqual({ text: '/review ', caret: 8 })
  })
})

describe('exactSlashCommand', () => {
  const commands = [cmd('clear'), cmd('compact')]
  it('only matches the whole command, without arguments', () => {
    expect(exactSlashCommand('/clear', commands)?.name).toBe('clear')
    expect(exactSlashCommand(' /clear ', commands)?.name).toBe('clear')
    expect(exactSlashCommand('/cle', commands)).toBeNull()
    expect(exactSlashCommand('/clear all', commands)).toBeNull()
    expect(exactSlashCommand('hi /clear', commands)).toBeNull()
  })
})

describe('filterSlash', () => {
  const commands = [cmd('review'), cmd('compact'), cmd('clear'), cmd('init')]
  it('empty lists in alphabetical order', () => {
    expect(filterSlash(commands, '').map((c) => c.name)).toEqual(['clear', 'compact', 'init', 'review'])
  })
  it('filters by fuzzy', () => {
    expect(filterSlash(commands, 'cmp').map((c) => c.name)).toEqual(['compact'])
    expect(filterSlash(commands, 'zzz')).toEqual([])
  })
  it('slashText leaves room for arguments', () => {
    expect(slashText(cmd('review'))).toBe('/review ')
  })
})

describe('history', () => {
  it('pushHistory ignores empty and consecutive repeats', () => {
    expect(pushHistory([], '  ')).toEqual([])
    expect(pushHistory(['a'], 'a')).toEqual(['a'])
    expect(pushHistory(['a'], ' b ')).toEqual(['a', 'b'])
    expect(pushHistory(['a', 'b'], 'a')).toEqual(['a', 'b', 'a'])
  })
  it('limits the size', () => {
    const big = Array.from({ length: 100 }, (_, i) => String(i))
    const next = pushHistory(big, 'new')
    expect(next).toHaveLength(100)
    expect(next[99]).toBe('new')
    expect(next[0]).toBe('1')
  })
  it('↑ walks back and ↓ returns to the draft', () => {
    const history = ['one', 'two']
    const up1 = historyUp(history, HISTORY_IDLE, 'draft')!
    expect(up1.text).toBe('two')
    const up2 = historyUp(history, up1.nav, 'two')!
    expect(up2.text).toBe('one')
    expect(historyUp(history, up2.nav, 'one')!.text).toBe('one')
    const down1 = historyDown(history, up2.nav)!
    expect(down1.text).toBe('two')
    const down2 = historyDown(history, down1.nav)!
    expect(down2).toEqual({ nav: HISTORY_IDLE, text: 'draft' })
    expect(historyDown(history, HISTORY_IDLE)).toBeNull()
    expect(historyUp([], HISTORY_IDLE, 'x')).toBeNull()
  })
  it('a navigation index past the history (history shrank) falls on the most recent and returns to the draft', () => {
    const stale = { index: 5, draft: 'draft' }
    const up1 = historyUp(['one', 'two'], stale, 'x')!
    expect(up1.text).toBe('two')
    expect(historyUp(['one', 'two'], up1.nav, 'x')?.text).toBe('one')
    expect(historyDown(['one', 'two'], stale)).toEqual({ nav: HISTORY_IDLE, text: 'draft' })
  })
  it('canRecall respects the cursor line and the selection', () => {
    expect(canRecall('up', 'a\nb', 1, 1)).toBe(true)
    expect(canRecall('up', 'a\nb', 3, 3)).toBe(false)
    expect(canRecall('down', 'a\nb', 3, 3)).toBe(true)
    expect(canRecall('down', 'a\nb', 0, 0)).toBe(false)
    expect(canRecall('up', 'abc', 0, 2)).toBe(false)
  })
})

describe('groupSlash', () => {
  it('groups into Project, Personal and Claude Code, keeping the item order', () => {
    const groups = groupSlash([cmd('compact'), cmd('mine', 'user'), cmd('review', 'project'), cmd('deploy', 'project')])
    expect(groups.map((g) => g.label)).toEqual(['Projeto', 'Pessoais', 'Claude Code'])
    expect(groups[0].items.map((c) => c.name)).toEqual(['review', 'deploy'])
  })
  it('empty groups disappear', () => {
    expect(groupSlash([cmd('x', 'user')]).map((g) => g.scope)).toEqual(['user'])
    expect(groupSlash([])).toEqual([])
  })
  it('the limit applies per group: a project command does not disappear behind built-ins', () => {
    const builtins = Array.from({ length: 60 }, (_, i) => cmd(`b${String(i).padStart(2, '0')}`))
    const all = [...builtins, cmd('zzz-deploy', 'project')]
    const groups = groupSlash(filterSlash(all, '', Infinity), 50)
    expect(groups[0].items.map((c) => c.name)).toEqual(['zzz-deploy'])
    expect(groups[1].items).toHaveLength(50)
  })
})

describe('/ menu in the middle of the text', () => {
  const commands = [cmd('review'), cmd('Loop'), cmd('compact')]
  it('only opens if the token is a prefix of some command', () => {
    expect(slashMenuApplies(activeSlash('look /tmp', 9)!, commands)).toBe(false)
    expect(slashMenuApplies(activeSlash('look /re', 8)!, commands)).toBe(true)
    expect(slashMenuApplies(activeSlash('look /LO', 8)!, commands)).toBe(true)
    expect(slashMenuApplies(activeSlash('look /', 6)!, commands)).toBe(true)
    // At the start, always (the list shows "nothing found").
    expect(slashMenuApplies(activeSlash('/tmp', 4)!, commands)).toBe(true)
  })
  it('Enter completes only a prefix different from what was typed; else it submits', () => {
    const mid = (t: string): ReturnType<typeof activeSlash> => activeSlash(t, t.length)
    expect(enterCompletesSlash(mid('look /re')!, cmd('review'))).toBe(true)
    expect(enterCompletesSlash(mid('look /review')!, cmd('review'))).toBe(false)
    expect(enterCompletesSlash(mid('look /cmp')!, cmd('compact'))).toBe(false)
    expect(enterCompletesSlash(mid('/cmp')!, cmd('compact'))).toBe(true)
  })
})

describe('insertAtCaret', () => {
  it('inserts at the cursor with a separating space', () => {
    expect(insertAtCaret('look this', '@a.ts', 4)).toEqual({ text: 'look @a.ts this', caret: 10 })
    expect(insertAtCaret('look ', '@a.ts', 5)).toEqual({ text: 'look @a.ts', caret: 10 })
  })

  it('no space at the start of the text', () => {
    expect(insertAtCaret('abc', '/', 0)).toEqual({ text: '/abc', caret: 1 })
  })

  it('replaces the selection', () => {
    expect(insertAtCaret('an item here', '@x', 3, 7)).toEqual({ text: 'an @x here', caret: 5 })
  })

  it('without a given selection inserts at the end, and clamps to the text length', () => {
    expect(insertAtCaret('abc', 'X')).toEqual({ text: 'abc X', caret: 5 })
    expect(insertAtCaret('abc', 'X', null, null)).toEqual({ text: 'abc X', caret: 5 })
    expect(insertAtCaret('abc', 'X', 99, 99)).toEqual({ text: 'abc X', caret: 5 })
  })
})

describe('promptKeyAction', () => {
  const key = (k: string, mods: Partial<PromptKey> = {}): PromptKey => ({
    key: k,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    isComposing: false,
    ...mods
  })
  const ctx = (over: Partial<PromptKeyContext> = {}): PromptKeyContext => ({
    text: 'oi',
    selectionStart: 2,
    selectionEnd: 2,
    commands: [cmd('clear'), cmd('compact')],
    menu: null,
    slashToken: null,
    marked: undefined,
    hasGhost: false,
    working: false,
    ...over
  })
  const slashMenu = { kind: 'slash', hasItems: true, dismissible: true } as const
  const mentionMenu = { kind: 'mention', hasItems: true, dismissible: true } as const
  const act = (e: PromptKey, c: PromptKeyContext = ctx()): string => promptKeyAction(e, c).type

  it('ignores any key during composition (IME)', () => {
    expect(act(key('Enter', { isComposing: true }))).toBe('none')
    expect(act(key('Escape', { isComposing: true }), ctx({ working: true }))).toBe('none')
  })

  it('Enter submits and Shift+Enter allows a line break', () => {
    expect(act(key('Enter'))).toBe('submit')
    expect(act(key('Enter', { shiftKey: true }))).toBe('none')
  })

  it('Enter with the menu open completes the marked item', () => {
    expect(act(key('Enter'), ctx({ menu: mentionMenu }))).toBe('acceptMenu')
    expect(act(key('Tab'), ctx({ menu: mentionMenu }))).toBe('acceptMenu')
  })

  it('Shift+Enter with the menu open neither completes nor submits', () => {
    expect(act(key('Enter', { shiftKey: true }), ctx({ menu: mentionMenu }))).toBe('none')
  })

  it('a menu without items captures neither Enter nor Tab', () => {
    const menu = { kind: 'slash', hasItems: false, dismissible: false } as const
    expect(act(key('Enter'), ctx({ menu }))).toBe('submit')
    expect(act(key('Tab'), ctx({ menu }))).toBe('none')
  })

  it('Enter with the command written in full submits instead of completing', () => {
    const slashToken = { start: 0, end: 6, query: 'clear' }
    const c = ctx({ text: '/clear', menu: slashMenu, slashToken, marked: cmd('clear') })
    expect(act(key('Enter'), c)).toBe('submit')
  })

  it('Enter with a partial command at the start completes', () => {
    const slashToken = { start: 0, end: 3, query: 'cl' }
    const c = ctx({ text: '/cl', menu: slashMenu, slashToken, marked: cmd('clear') })
    expect(act(key('Enter'), c)).toBe('acceptMenu')
    expect(act(key('Tab'), c)).toBe('acceptMenu')
  })

  it('in the middle of the text, Enter on the already typed command submits; on a prefix, completes', () => {
    const full = ctx({
      text: 'look /clear',
      menu: slashMenu,
      slashToken: { start: 5, end: 11, query: 'clear' },
      marked: cmd('clear')
    })
    expect(act(key('Enter'), full)).toBe('submit')
    const partial = ctx({
      text: 'look /cl',
      menu: slashMenu,
      slashToken: { start: 5, end: 8, query: 'cl' },
      marked: cmd('clear')
    })
    expect(act(key('Enter'), partial)).toBe('acceptMenu')
  })

  it('Enter with the menu open and text equal to a command submits', () => {
    expect(act(key('Enter'), ctx({ text: '/compact', menu: mentionMenu }))).toBe('submit')
  })

  it('Tab accepts the suggestion only without modifiers', () => {
    expect(act(key('Tab'), ctx({ hasGhost: true }))).toBe('acceptSuggestion')
    expect(act(key('Tab', { ctrlKey: true }), ctx({ hasGhost: true }))).toBe('none')
    expect(act(key('Tab', { altKey: true }), ctx({ hasGhost: true }))).toBe('none')
    expect(act(key('Tab', { metaKey: true }), ctx({ hasGhost: true }))).toBe('none')
    expect(act(key('Tab'))).toBe('none')
  })

  it('Shift+Tab toggles the permission mode, with or without a suggestion', () => {
    expect(act(key('Tab', { shiftKey: true }))).toBe('cycleMode')
    expect(act(key('Tab', { shiftKey: true }), ctx({ hasGhost: true }))).toBe('cycleMode')
    expect(act(key('Tab', { shiftKey: true }), ctx({ menu: slashMenu }))).toBe('cycleMode')
  })

  it('Esc closes the menu, else interrupts the turn, else returns to the editor', () => {
    expect(act(key('Escape'), ctx({ menu: slashMenu, working: true }))).toBe('dismissMenu')
    expect(act(key('Escape'), ctx({ menu: mentionMenu }))).toBe('dismissMenu')
    expect(act(key('Escape'), ctx({ working: true }))).toBe('interrupt')
    expect(act(key('Escape'))).toBe('focusEditor')
  })

  it('Esc with a / menu without items does not treat it as a menu', () => {
    const menu = { kind: 'slash', hasItems: false, dismissible: false } as const
    expect(act(key('Escape'), ctx({ menu }))).toBe('focusEditor')
  })

  it('↑ and ↓ recall the history at the ends of the text', () => {
    expect(promptKeyAction(key('ArrowUp'), ctx())).toEqual({ type: 'history', direction: 'up' })
    expect(promptKeyAction(key('ArrowDown'), ctx())).toEqual({ type: 'history', direction: 'down' })
  })

  it('↑ in the middle of several lines moves the cursor instead of recalling', () => {
    const multi = { text: 'a\nb\nc', selectionStart: 3, selectionEnd: 3 }
    expect(act(key('ArrowUp'), ctx(multi))).toBe('none')
    expect(act(key('ArrowDown'), ctx(multi))).toBe('none')
    expect(act(key('ArrowUp'), ctx({ text: 'a\nb', selectionStart: 0, selectionEnd: 0 }))).toBe('history')
    expect(act(key('ArrowDown'), ctx({ text: 'a\nb', selectionStart: 3, selectionEnd: 3 }))).toBe('history')
  })

  it('↑/↓ with a selection or modifier do not recall the history', () => {
    expect(act(key('ArrowUp'), ctx({ selectionStart: 0, selectionEnd: 2 }))).toBe('none')
    for (const mods of [{ shiftKey: true }, { altKey: true }, { ctrlKey: true }, { metaKey: true }])
      expect(act(key('ArrowUp', mods))).toBe('none')
  })

  it('other keys follow the normal path', () => {
    expect(act(key('a'))).toBe('none')
    expect(act(key('Backspace'))).toBe('none')
  })
})
