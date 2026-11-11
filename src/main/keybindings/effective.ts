import { COMMAND_IDS } from '@shared/commands'
import { resolveBindings, sameBindingList, type Bindings } from './userKeybindings'
import { createEmitter } from '../util/emitter'

// Effective shortcuts (default ← the user's keybindings.json), with each one's `when` clause. Global app state: the
// `keybindings.json` applies to all windows. Menu and `before-input-event` read from here whenever they need it (never
// a copy computed only once).
let current: Bindings = resolveBindings(process.platform)
const changes = createEmitter('keybindings')

export function getBindings(): Bindings {
  return current
}

const sameBindings = (a: Bindings, b: Bindings): boolean => COMMAND_IDS.every((id) => sameBindingList(a[id], b[id]))

export function setBindings(next: Bindings): void {
  if (sameBindings(current, next)) return
  current = next
  changes.emit()
}

export const onBindingsChange = changes.on
