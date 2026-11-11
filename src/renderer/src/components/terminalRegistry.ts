// Live xterm instances per terminal, for whoever needs them outside `TerminalView` (focus, search).
import type { Terminal } from '@xterm/xterm'
import type { SearchAddon } from '@xterm/addon-search'

export const terms = new Map<string, Terminal>()
export const searches = new Map<string, SearchAddon>()

export function focusTerminal(id: string | null): void {
  if (id) terms.get(id)?.focus()
}
