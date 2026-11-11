// Terminal groups of the panel: each tab is a group of 1..n terminals side by side. Pure logic over the store
// list (the array order gives the order of the panes inside the group; the members of a group are contiguous).

export interface GroupedTerminal {
  id: string
  groupId: string
  /** Automatic title (foreground process). */
  title: string
  /** Name given by the user; wins over the automatic one. */
  customTitle?: string | undefined
}

const TITLE_MAX_LENGTH = 64

export function displayTitle(t: Pick<GroupedTerminal, 'title' | 'customTitle'>): string {
  return t.customTitle ?? t.title
}

/** Group ids in the order they appear. */
export function groupIds(terminals: readonly GroupedTerminal[]): string[] {
  return [...new Set(terminals.map((t) => t.groupId))]
}

export function membersOf<T extends GroupedTerminal>(terminals: readonly T[], groupId: string): T[] {
  return terminals.filter((t) => t.groupId === groupId)
}

/** Label of a group's tab: the titles of the panes ("zsh, htop"). */
export function groupLabel(terminals: readonly GroupedTerminal[], groupId: string): string {
  return membersOf(terminals, groupId).map(displayTitle).join(', ')
}

/** Inserts `terminal` right after `afterId` (at the end, if not found), which keeps it in the same group next to it. */
export function insertAfter<T extends GroupedTerminal>(terminals: readonly T[], afterId: string, terminal: T): T[] {
  const index = terminals.findIndex((t) => t.id === afterId)
  if (index < 0) return [...terminals, terminal]
  return [...terminals.slice(0, index + 1), terminal, ...terminals.slice(index + 1)]
}

/**
 * Removes a terminal and picks the next active one. If the removed one was the active one, a neighbor of the same group
 * applies (the previous, else the next); without neighbors, the last remaining terminal. Another active terminal does
 * not change.
 */
export function removeTerminalFrom<T extends GroupedTerminal>(
  terminals: readonly T[],
  id: string,
  activeId: string | null
): { terminals: T[]; activeId: string | null } {
  const removed = terminals.find((t) => t.id === id)
  const rest = terminals.filter((t) => t.id !== id)
  if (!removed || activeId !== id) return { terminals: rest, activeId: activeId === id ? null : activeId }
  const siblings = terminals.filter((t) => t.groupId === removed.groupId)
  const at = siblings.findIndex((t) => t.id === id)
  const neighbor = siblings[at - 1] ?? siblings[at + 1]
  return { terminals: rest, activeId: neighbor?.id ?? rest[rest.length - 1]?.id ?? null }
}

/** Text typed when renaming → custom name (empty = `undefined`, back to the automatic title). */
export function normalizeCustomTitle(input: string): string | undefined {
  const text = input
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, TITLE_MAX_LENGTH)
    .trim()
  return text === '' ? undefined : text
}
