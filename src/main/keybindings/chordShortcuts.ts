import { app, type WebContents } from 'electron'
import { COMMAND_IDS, type CommandId } from '@shared/commands'
import { menuCommandIds } from '../menu/template'
import type { Binding } from './userKeybindings'
import { buildChordTable, buildSingleTable, createChordMatcher } from './chords'
import { getBindings, onBindingsChange } from './effective'
import { getContext, resetContext } from './context'
import { deliverCommand } from '../window/viewDelivery'
import { runWorkspaceCommandWhenUnresponsive } from '../window/workspaceCommands'
import { onViewDestroyed } from '../window/viewLifecycle'

/**
 * Shortcuts the native menu does not cover, handled before the page (including xterm) sees the key: chords
 * (`Ctrl+K S`), single strokes of commands without a menu item (those that already have an accelerator in the menu
 * keep it) and any shortcut with a `when` clause (evaluated against the window context; false = the key goes on to
 * the page).
 * State per webContents; the tables are rebuilt when `keybindings.json` changes.
 */
export function installChordShortcuts(wc: WebContents): void {
  const platform = process.platform
  const menuIds = menuCommandIds(platform, app.isPackaged)
  const matcher = createChordMatcher([], Date.now, [], () => getContext(wc))
  const rebuild = (): void => {
    const bindings = getBindings()
    const bindingOf = (id: CommandId): readonly Binding[] | undefined => bindings[id]
    matcher.update(
      buildChordTable(COMMAND_IDS, platform, bindingOf, app.isPackaged),
      buildSingleTable(COMMAND_IDS, platform, bindingOf, (id) => menuIds.has(id), app.isPackaged)
    )
  }
  rebuild()
  const unsubscribe = onBindingsChange(rebuild)
  onViewDestroyed(wc, 'chord-shortcuts', unsubscribe)

  wc.on('before-input-event', (event, input) => {
    const result = matcher.handle(input)
    if (result.action === 'pass') return
    event.preventDefault()
    if (result.action === 'run' && !wc.isDestroyed() && !runWorkspaceCommandWhenUnresponsive(wc, result.id))
      deliverCommand(wc, result.id)
  })
  // Losing focus abandons the pending chord.
  wc.on('blur', () => matcher.reset())
  // Reloading resets the renderer state: the context reported before no longer holds.
  wc.on('did-navigate', () => {
    resetContext(wc)
    matcher.reset()
  })
}
