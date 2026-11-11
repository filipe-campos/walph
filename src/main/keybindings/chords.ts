import { isChord, isCommandAvailable, type CommandId } from '@shared/commands'
import { defaultBindings, type Binding } from './userKeybindings'
import { evaluateWhen, parseWhen, type WhenContext, type WhenExpr } from './when'

/** Subset of `Electron.Input` the logic needs. */
export interface KeyInput {
  type: string
  key: string
  code: string
  control: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}

export interface Stroke {
  /** Lowercase key (`k`, `s`, `f5`, `` ` ``). */
  key: string
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}

export interface Chord {
  id: CommandId
  first: Stroke
  second: Stroke
  /** Only applies with a true clause; false = the key goes on to the page (e.g. `Ctrl+K` in the terminal shell). */
  when?: WhenExpr
}

/** How long the 1st stroke of the chord waits for the 2nd. */
export const CHORD_TIMEOUT_MS = 3000

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'OS', 'Super'])

/** Converts a simple accelerator (`Ctrl+K`, `Alt+Cmd+S`) into a `Stroke`. */
export function parseStroke(accelerator: string, platform: string): Stroke {
  const stroke: Stroke = { key: '', ctrl: false, alt: false, shift: false, meta: false }
  const isMac = platform === 'darwin'
  const parts = accelerator.split('+')
  // "Ctrl+Plus": the trailing `+` becomes an empty part; "Ctrl++" too.
  for (const raw of parts) {
    const part = raw.trim()
    const lower = part.toLowerCase()
    if (lower === 'ctrl' || lower === 'control') stroke.ctrl = true
    else if (lower === 'cmdorctrl' || lower === 'commandorcontrol') {
      if (isMac) stroke.meta = true
      else stroke.ctrl = true
    } else if (lower === 'cmd' || lower === 'command' || lower === 'meta' || lower === 'super') stroke.meta = true
    else if (lower === 'alt' || lower === 'option') stroke.alt = true
    else if (lower === 'shift') stroke.shift = true
    else if (lower === 'plus') stroke.key = '+'
    else if (part) stroke.key = lower
  }
  return stroke
}

// Accelerator key names (`up`, `esc`, `space`) → lowercase `KeyboardEvent.key`.
const KEY_ALIASES: Record<string, string> = {
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  esc: 'escape',
  space: ' '
}

// Punctuation → `KeyboardEvent.code`: with Shift the `key` changes (`Ctrl+Shift+\`` arrives as `~`), `code` does not.
const PUNCTUATION_CODES: Record<string, string> = {
  '`': 'Backquote',
  '-': 'Minus',
  '=': 'Equal',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '\\': 'Backslash',
  ';': 'Semicolon',
  "'": 'Quote',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash'
}

function keyMatches(input: KeyInput, key: string): boolean {
  // Tables looked up only by own key (the key comes from the user's keybindings.json).
  const alias = Object.hasOwn(KEY_ALIASES, key) ? KEY_ALIASES[key] : undefined
  if (input.key.toLowerCase() === (alias ?? key)) return true
  const punctuation = Object.hasOwn(PUNCTUATION_CODES, key) ? PUNCTUATION_CODES[key] : undefined
  if (punctuation) return input.code === punctuation
  // With Alt/Shift the `key` may change (e.g. Alt+S on macOS); `code` is layout-independent for letters and digits.
  if (/^[a-z]$/.test(key)) return input.code === `Key${key.toUpperCase()}`
  if (/^[0-9]$/.test(key)) return input.code === `Digit${key}`
  return false
}

/** `true` if the event is exactly the stroke (same modifier keys, none left over). */
export function matchesStroke(input: KeyInput, stroke: Stroke): boolean {
  return (
    input.control === stroke.ctrl &&
    input.alt === stroke.alt &&
    input.shift === stroke.shift &&
    input.meta === stroke.meta &&
    keyMatches(input, stroke.key)
  )
}

/** Single-stroke shortcut, handled here only for commands without a menu item (the menu covers the rest). */
export interface SingleBinding {
  id: CommandId
  stroke: Stroke
  when?: WhenExpr
}

/** Compiles the shortcut's `when`; `null` if invalid (the shortcut is dropped instead of always applying). */
function compileWhen(binding: Binding): { when?: WhenExpr } | null {
  if (!binding.when) return {}
  const parsed = parseWhen(binding.when)
  return 'expr' in parsed ? { when: parsed.expr } : null
}

const defaultBindingsOf = (platform: string): ((id: CommandId) => readonly Binding[] | undefined) => {
  const table = defaultBindings(platform)
  return (id) => table[id]
}

/**
 * `true` if shortcut `index` of the command is the native menu accelerator: only the FIRST shortcut of a command with
 * a menu item, without `when` and not a chord. All the others (2nd onward, with `when`, commands without an item)
 * belong to `before-input-event`. Single source of the rule for `menu.ts` and for `buildSingleTable`.
 */
export function isMenuAccelerator(binding: Binding, index: number): boolean {
  return index === 0 && !binding.when && !isChord(binding.key)
}

/**
 * Builds the chord table (`Ctrl+K S` → first `Ctrl+K`, second `S`). `bindingsOf` returns the effective shortcuts
 * (default ← `keybindings.json`, with `when`); without it, the platform defaults apply. A command can have several.
 */
export function buildChordTable(
  ids: readonly CommandId[],
  platform: string,
  bindingsOf: (id: CommandId) => readonly Binding[] | undefined = defaultBindingsOf(platform),
  isPackaged = false
): Chord[] {
  const chords: Chord[] = []
  for (const id of ids) {
    if (!isCommandAvailable(id, platform, isPackaged)) continue
    for (const binding of bindingsOf(id) ?? []) {
      if (!isChord(binding.key)) continue
      const [first, second] = binding.key.trim().split(/\s+/)
      const compiled = compileWhen(binding)
      if (!first || !second || !compiled) continue
      chords.push({ id, first: parseStroke(first, platform), second: parseStroke(second, platform), ...compiled })
    }
  }
  return chords
}

/**
 * Single-stroke shortcuts handled here: all of them, except the one the native menu already registers as accelerator
 * (`isMenuCommand(id)` = the command has a menu item; see `isMenuAccelerator`). So what remains are those of commands
 * without an item, the 2nd+ of each command and those with `when`.
 * Commands unavailable on the platform/build are left out: the key goes on to the page.
 */
export function buildSingleTable(
  ids: readonly CommandId[],
  platform: string,
  bindingsOf: (id: CommandId) => readonly Binding[] | undefined,
  isMenuCommand: (id: CommandId) => boolean,
  isPackaged = false
): SingleBinding[] {
  const singles: SingleBinding[] = []
  for (const id of ids) {
    if (!isCommandAvailable(id, platform, isPackaged)) continue
    const menu = isMenuCommand(id)
    ;(bindingsOf(id) ?? []).forEach((binding, index) => {
      if (isChord(binding.key) || (menu && isMenuAccelerator(binding, index))) return
      const compiled = compileWhen(binding)
      if (!compiled) return
      singles.push({ id, stroke: parseStroke(binding.key, platform), ...compiled })
    })
  }
  return singles
}

type ChordResult =
  /** Not about the chord: lets the event go on normally. */
  | { action: 'pass' }
  /** Swallows the event (1st stroke, or a 2nd stroke that did not match). */
  | { action: 'swallow' }
  /** Full chord: swallows the event and runs the command. */
  | { action: 'run'; id: CommandId }

export interface ChordMatcher {
  handle(input: KeyInput): ChordResult
  /** Cancels the pending chord (e.g. focus loss). */
  reset(): void
  /** Swaps the tables (the user edited `keybindings.json`); drops the pending chord. */
  update(chords: Chord[], singles: SingleBinding[]): void
}

/**
 * Chord state machine (one per webContents). As in VS Code, a 2nd stroke that does not match is swallowed and
 * ends the chord; the pending chord also expires on its own.
 */
export function createChordMatcher(
  initialChords: Chord[],
  now: () => number = Date.now,
  initialSingles: SingleBinding[] = [],
  getContext: () => WhenContext = () => ({})
): ChordMatcher {
  let chords = initialChords
  let singles = initialSingles
  let pendingSince: number | null = null
  // Chords whose 1st stroke matched (with `when` true at that moment): only their 2nd stroke counts.
  let pending: Chord[] = []
  const active = (b: { when?: WhenExpr }): boolean => !b.when || evaluateWhen(b.when, getContext())

  return {
    reset() {
      pendingSince = null
      pending = []
    },
    update(nextChords, nextSingles) {
      chords = nextChords
      singles = nextSingles
      pendingSince = null
      pending = []
    },
    handle(input) {
      if ((chords.length === 0 && singles.length === 0) || input.type !== 'keyDown') return { action: 'pass' }

      if (pendingSince !== null && now() - pendingSince > CHORD_TIMEOUT_MS) pendingSince = null

      if (pendingSince !== null) {
        // Modifiers alone (the user still holding Ctrl) do not count as a 2nd stroke.
        if (MODIFIER_KEYS.has(input.key)) return { action: 'pass' }
        // The `when` also applies on the 2nd stroke: if focus changed between the two, the chord does not fire.
        const hit = pending.find((c) => matchesStroke(input, c.second) && active(c))
        if (hit) {
          pendingSince = null
          return { action: 'run', id: hit.id }
        }
        // The first key that does not match ends the chord and is swallowed; the following ones go back to normal
        // (otherwise typing after Ctrl+K would lose text).
        pendingSince = null
        return { action: 'swallow' }
      }

      // `when` false: the 1st stroke goes on to the page (e.g. Ctrl+K reaches the shell when focus is in the terminal).
      const starting = chords.filter((c) => matchesStroke(input, c.first) && active(c))
      if (starting.length > 0) {
        pending = starting
        pendingSince = now()
        return { action: 'swallow' }
      }
      // If a chord starts with the same stroke, the chord wins (above); the single stroke runs directly. The user
      // resolution already removes overlapping shortcuts of different commands: several active ones for the same key
      // only happen within one command or in the defaults. To be safe, the one with `when` (more specific) wins.
      const hits = singles.filter((b) => matchesStroke(input, b.stroke) && active(b))
      const single = hits.find((b) => b.when) ?? hits[0]
      if (single) return { action: 'run', id: single.id }
      return { action: 'pass' }
    }
  }
}
