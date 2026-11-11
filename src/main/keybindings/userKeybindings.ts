import { t } from '@shared/i18n'
import { COMMAND_IDS, defaultKeybindings, type CommandId } from '@shared/commands'
import { parseJsonc } from '../settings/parseJsonc'
import { parseWhen, whenTextsDisjoint } from './when'

export interface KeybindingEntry {
  key: string
  /** Command id; `-<id>` removes the shortcut of that command. */
  command: string
  /** `when` clause (already validated); absent = always active. */
  when?: string
}

/** One effective shortcut: the key and, optionally, the `when` clause that activates it. */
export interface Binding {
  key: string
  when?: string
}

/** Effective shortcuts of each command, in order of preference (the first shows in the menu); never an empty list. */
export type Bindings = Partial<Record<CommandId, Binding[]>>
/** Only the keys (id → shortcuts, same order), for display. */
export type Keybindings = Partial<Record<CommandId, string[]>>

/** Equal shortcut lists (order, key and `when`); absent counts as an empty list. */
export function sameBindingList(a: readonly Binding[] | undefined, b: readonly Binding[] | undefined): boolean {
  const x = a ?? []
  const y = b ?? []
  return x.length === y.length && x.every((binding, i) => binding.key === y[i]?.key && binding.when === y[i].when)
}

export function bindingKeys(bindings: Bindings): Keybindings {
  const keys: Keybindings = {}
  for (const id of COMMAND_IDS) {
    const list = bindings[id]
    if (list && list.length > 0) keys[id] = list.map((b) => b.key)
  }
  return keys
}

/** Default shortcuts (key + `when`) of each command on the platform. */
export function defaultBindings(platform: string): Bindings {
  const result: Bindings = {}
  for (const id of COMMAND_IDS) {
    const list = defaultKeybindings(id, platform)
    if (list.length > 0) result[id] = list.map((b) => (b.when ? { key: b.key, when: b.when } : { key: b.key }))
  }
  return result
}

const NAMED_KEYS: Record<string, string> = {
  esc: 'Esc',
  escape: 'Esc',
  enter: 'Enter',
  return: 'Enter',
  tab: 'Tab',
  space: 'Space',
  backspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  insert: 'Insert',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  up: 'Up',
  arrowup: 'Up',
  down: 'Down',
  arrowdown: 'Down',
  left: 'Left',
  arrowleft: 'Left',
  right: 'Right',
  arrowright: 'Right',
  plus: 'Plus'
}

const PUNCTUATION = "`-=[]\\;',./"

interface Stroke {
  ctrl: boolean
  cmdOrCtrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
  /** Already in accelerator format (`P`, `F5`, `Plus`, `Up`, `,`). */
  key: string
}

function normalizeKeyToken(token: string): string | null {
  const lower = token.toLowerCase()
  // The key comes from keybindings.json: `constructor` cannot become the function inherited from the prototype.
  const named = Object.hasOwn(NAMED_KEYS, lower) ? NAMED_KEYS[lower] : undefined
  if (named) return named
  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(lower)) return lower.toUpperCase()
  if (/^[a-z0-9]$/.test(lower)) return lower.toUpperCase()
  if (token.length === 1 && PUNCTUATION.includes(token)) return token
  return null
}

/** Reads a stroke (`ctrl+shift+p`, `Cmd+,`, `CmdOrCtrl+Plus`, `ctrl++`). `null` if invalid. */
function parseStroke(text: string): Stroke | null {
  let rest = text.trim()
  const stroke: Stroke = { ctrl: false, cmdOrCtrl: false, alt: false, shift: false, meta: false, key: '' }
  // `+` as a key ("ctrl++", "+") cannot be split by split.
  if (rest.endsWith('+')) {
    stroke.key = 'Plus'
    rest = rest.slice(0, -1)
    if (rest.endsWith('+')) rest = rest.slice(0, -1)
    else if (rest !== '') return null
  }
  for (const raw of rest === '' ? [] : rest.split('+')) {
    const part = raw.trim()
    const lower = part.toLowerCase()
    if (lower === 'ctrl' || lower === 'control') stroke.ctrl = true
    else if (lower === 'cmdorctrl' || lower === 'commandorcontrol') stroke.cmdOrCtrl = true
    else if (['cmd', 'command', 'meta', 'win', 'super'].includes(lower)) stroke.meta = true
    else if (lower === 'alt' || lower === 'option') stroke.alt = true
    else if (lower === 'shift') stroke.shift = true
    else {
      if (stroke.key) return null
      const key = normalizeKeyToken(part)
      if (!key) return null
      stroke.key = key
    }
  }
  return stroke.key ? stroke : null
}

function formatStroke(s: Stroke, platform: string): string {
  const parts: string[] = []
  if (s.cmdOrCtrl) parts.push('CmdOrCtrl')
  if (s.ctrl) parts.push('Ctrl')
  if (s.alt) parts.push('Alt')
  // `Cmd` only exists on macOS; on the other OSes the Windows/Super key is `Super`.
  if (s.meta) parts.push(platform === 'darwin' ? 'Cmd' : 'Super')
  if (s.shift) parts.push('Shift')
  parts.push(s.key)
  return parts.join('+')
}

/** Canonical form to compare shortcuts (CmdOrCtrl resolved by platform, case-insensitive key). */
export function canonical(binding: string, platform: string): string {
  const strokes = binding.trim().split(/\s+/)
  return strokes
    .map((text) => {
      const s = parseStroke(text)
      if (!s) return text.toLowerCase()
      const isMac = platform === 'darwin'
      const ctrl = s.ctrl || (s.cmdOrCtrl && !isMac)
      const meta = s.meta || (s.cmdOrCtrl && isMac)
      return `${ctrl ? 'c' : ''}${s.alt ? 'a' : ''}${meta ? 'm' : ''}${s.shift ? 's' : ''}+${s.key.toLowerCase()}`
    })
    .join(' ')
}

const FUNCTION_KEY = /^F\d+$/

/**
 * Normalizes a VS Code or Electron style shortcut (`ctrl+k ctrl+s`, `Cmd+,`) to the Electron accelerator
 * (`Ctrl+K Ctrl+S`, `Cmd+,`). Chords are strokes separated by a space (at most two). Returns the error message
 * (in the current language) if invalid.
 */
export function normalizeKeybinding(text: string, platform: string): { accelerator: string } | { error: string } {
  const trimmed = text.trim()
  if (trimmed === '') return { error: t().commands.keybindingsFile.emptyKey }
  const rawStrokes = trimmed.split(/\s+/)
  if (rawStrokes.length > 2) return { error: t().commands.keybindingsFile.tooManyStrokes(text) }
  const strokes: Stroke[] = []
  for (const raw of rawStrokes) {
    const stroke = parseStroke(raw)
    if (!stroke) return { error: t().commands.keybindingsFile.invalidStroke(text, raw) }
    strokes.push(stroke)
  }
  const first = strokes[0]
  if (!first) return { error: t().commands.keybindingsFile.emptyKey }
  // Without a modifier, a letter/punctuation would capture typing in the editor and the terminal.
  const hasModifier = first.ctrl || first.cmdOrCtrl || first.alt || first.meta
  if (!hasModifier && !FUNCTION_KEY.test(first.key) && first.key !== 'Esc') {
    return { error: t().commands.keybindingsFile.needsModifier(text) }
  }
  return { accelerator: strokes.map((s) => formatStroke(s, platform)).join(' ') }
}

function isCommandId(value: string): value is CommandId {
  return (COMMAND_IDS as readonly string[]).includes(value)
}

/**
 * Reads `keybindings.json` (JSONC, array of `{ "key", "command" }`). Invalid entries become warnings and are ignored
 * one by one; a syntax error or a root that is not an array invalidates the file (`error`). The optional `when`
 * field is validated (see `when.ts`): an unknown identifier or a syntax error ignores the whole entry, with a warning.
 */
export function parseUserKeybindings(
  text: string,
  platform: string
): { entries: KeybindingEntry[]; warnings: string[] } | { error: string } {
  if (text.trim() === '') return { entries: [], warnings: [] }
  const parsed = parseJsonc(text)
  if ('error' in parsed) return { error: parsed.error }
  if (parsed.value === undefined) return { entries: [], warnings: [] }
  if (!Array.isArray(parsed.value)) return { error: t().commands.keybindingsFile.notAList }

  const entries: KeybindingEntry[] = []
  const warnings: string[] = []
  const m = t().commands.keybindingsFile
  parsed.value.forEach((raw: unknown, index) => {
    const where = m.entry(index + 1)
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      warnings.push(`${where}: ${m.expectedObject}`)
      return
    }
    const { key, command, when } = raw as { key?: unknown; command?: unknown; when?: unknown }
    if (typeof command !== 'string' || typeof key !== 'string') {
      warnings.push(`${where}: ${m.keyAndCommandText}`)
      return
    }
    const id = command.startsWith('-') ? command.slice(1) : command
    if (!isCommandId(id)) {
      warnings.push(`${where}: ${m.unknownCommand(command)}`)
      return
    }
    // To remove, the key is optional in practice (removes any shortcut of the command), but if given, it must be valid.
    if (command.startsWith('-') && when !== undefined) {
      warnings.push(`${where}: ${m.whenIgnored(command)}`)
    }
    if (command.startsWith('-') && key.trim() === '') {
      entries.push({ key: '', command })
      return
    }
    let whenText: string | undefined
    if (when !== undefined && !command.startsWith('-')) {
      // `"when": ""` (or only spaces) = always active, as in VS Code: no warning.
      const parsedWhen = typeof when === 'string' && when.trim() !== '' ? parseWhen(when) : undefined
      if (typeof when !== 'string') {
        warnings.push(`${where}: ${m.whenNotText}`)
        return
      }
      if (parsedWhen && 'error' in parsedWhen) {
        warnings.push(`${where}: ${m.whenInvalid(parsedWhen.error)}`)
        return
      }
      if (parsedWhen) whenText = when.trim()
    }
    const normalized = normalizeKeybinding(key, platform)
    if ('error' in normalized) {
      warnings.push(`${where}: ${normalized.error}`)
      return
    }
    entries.push(
      whenText ? { key: normalized.accelerator, command, when: whenText } : { key: normalized.accelerator, command }
    )
  })
  return { entries, warnings }
}

/**
 * Effective shortcuts of each command: platform defaults, then the user entries in order.
 * - The user's 1st entry for a command REPLACES its default list (key and `when`); the following ones of the same
 *   command are appended at the end (the 1st stays the main one, the one the menu shows). Repeating key+`when` does
 *   not duplicate.
 * - `{ "key": "X", "command": "-id" }` removes only the key X shortcut (canonical comparison) of that command; `-id`
 *   with an empty key removes all of its shortcuts.
 * - Conflict: the user shortcut (key K, `when` W) removes from the OTHER commands only the shortcuts with the same key
 *   (or in prefix conflict: the 1st stroke of a chord against a single stroke, which would take the single stroke off
 *   the air, since the chord wins in `before-input-event`; two chords with the same 1st stroke coexist) whose `when`
 *   is NOT disjoint from W.
 *   Equal keys with disjoint `when`s coexist (main picks by the window context); for the rest the user wins.
 */
export function resolveBindings(platform: string, entries: readonly KeybindingEntry[] = []): Bindings {
  const result = defaultBindings(platform)
  const overridden = new Set<CommandId>()
  for (const { key, command, when } of entries) {
    if (command.startsWith('-')) {
      const id = command.slice(1)
      if (!isCommandId(id)) continue
      if (key.trim() === '') {
        delete result[id]
        continue
      }
      const target = canonical(key, platform)
      // Removing a shortcut with a key means taking over the command's list: following entries append instead of
      // erasing the rest.
      overridden.add(id)
      const rest = (result[id] ?? []).filter((b) => canonical(b.key, platform) !== target)
      if (rest.length > 0) result[id] = rest
      else delete result[id]
      continue
    }
    if (!isCommandId(command)) continue
    const wanted = canonical(key, platform).split(' ')
    for (const other of COMMAND_IDS) {
      const list = result[other]
      if (other === command || !list) continue
      const kept = list.filter((b) => {
        const theirs = canonical(b.key, platform).split(' ')
        const exact = theirs.length === wanted.length && theirs.every((stroke, i) => stroke === wanted[i])
        const prefix = theirs.length !== wanted.length && theirs[0] === wanted[0]
        return !((exact || prefix) && !whenTextsDisjoint(b.when, when))
      })
      if (kept.length === list.length) continue
      if (kept.length > 0) result[other] = kept
      else delete result[other]
    }
    const binding: Binding = when ? { key, when } : { key }
    if (!overridden.has(command)) {
      overridden.add(command)
      result[command] = [binding]
      continue
    }
    const list = (result[command] ??= [])
    const wantedKey = canonical(key, platform)
    if (!list.some((b) => canonical(b.key, platform) === wantedKey && b.when === binding.when)) list.push(binding)
  }
  return result
}

/** Like `resolveBindings`, but only the keys (id → shortcuts). */
export function resolveKeybindings(platform: string, entries: readonly KeybindingEntry[] = []): Keybindings {
  return bindingKeys(resolveBindings(platform, entries))
}
