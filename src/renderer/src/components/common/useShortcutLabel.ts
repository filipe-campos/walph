import type { CommandId } from '@shared/commands'
import { shortcutLabel } from '../../lib/keybinding'
import { useStore } from '../../store'

/**
 * Effective command shortcut for the UI (`''` without a shortcut; `null` turns it off, e.g. beyond the first nine
 * tabs).
 */
export function useShortcutLabel(id: CommandId | null | undefined): string {
  return useStore((s) => (id ? shortcutLabel(s.keybindings, id, window.api.platform) : ''))
}
