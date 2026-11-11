import { defaultKeybinding, type CommandId } from '@shared/commands'
import { formatKeybinding } from '@shared/keybindingLabel'

export { formatKeybinding }

/**
 * Text of a command's effective shortcut to show in the UI: the first from `keybindings.json` (snapshot map) or, before
 * the first snapshot (`null`), the default. A command without a shortcut = `''`.
 */
export function shortcutLabel(
  keybindings: Partial<Record<CommandId, string[]>> | null,
  id: CommandId,
  platform: string
): string {
  // The UI shows the first shortcut of the list (the others apply, but only in main).
  const accelerator = keybindings ? keybindings[id]?.[0] : defaultKeybinding(id, platform)
  return accelerator ? formatKeybinding(accelerator, platform) : ''
}
