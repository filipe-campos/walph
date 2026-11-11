// Single command registry: the native menu and the palette execute through here.
import type { CommandId } from '@shared/commands'
import { t } from '@shared/i18n'
import { get, type State } from '../store'
import { attempt } from '../attempt'
import { notify } from '../toasts'

export interface Command {
  id: CommandId
  /** In the current language: the built-ins use getters, so read at display time (never store). */
  readonly title: string
  readonly category: string
  /** Default shortcut (Electron accelerator, `CmdOrCtrl+Shift+P`); the effective one comes from `keybindingOf`. */
  keybinding?: string | undefined
  /** The command is hidden and not executable when it returns false. */
  when?: (() => boolean) | undefined
  run: (...args: unknown[]) => unknown
}

const RECENT_KEY = 'walph.recentCommands'
const RECENT_MAX = 10

const OVERLAY_COMMANDS: ReadonlySet<CommandId> = new Set<CommandId>([
  'workbench.showCommandPalette',
  'workbench.showUnifiedPalette',
  'workbench.quickOpen',
  'editor.goToLine'
])

// Commands that do not touch the workbench hidden behind the Settings modal: they run with it open.
const GLOBAL_COMMANDS: ReadonlySet<CommandId> = new Set<CommandId>([
  'workbench.openSettings',
  'workbench.newWindow',
  'workbench.closeWindow',
  'workbench.quit',
  'workbench.reload',
  'workbench.toggleDevTools',
  'view.resetZoom',
  'view.zoomIn',
  'view.zoomOut',
  'view.toggleFullScreen'
])

export interface OverlayPolicy {
  /** Lower `priority` is evaluated first. */
  priority: number
  active: (state: State) => boolean
  /** Commands (besides the global ones) that run without closing the overlay. */
  keeps?: (id: CommandId) => boolean
  close: (id: CommandId) => void
  /** The command was already handled by the close and must not run. */
  consumes: (id: CommandId) => boolean
}

const overlayPolicies: OverlayPolicy[] = []

/** Overlays and screens that hide the workbench yield to commands here; the overlay owner registers its policy. */
export function registerOverlayPolicy(policy: OverlayPolicy): () => void {
  overlayPolicies.push(policy)
  overlayPolicies.sort((a, b) => a.priority - b.priority)
  return () => {
    const index = overlayPolicies.indexOf(policy)
    if (index >= 0) overlayPolicies.splice(index, 1)
  }
}

/** Closes the active overlays the command does not keep; returns `true` if any of them consumed the command. */
function leaveOverlays(id: CommandId): boolean {
  if (GLOBAL_COMMANDS.has(id)) return false
  for (const policy of overlayPolicies) {
    if (!policy.active(get()) || policy.keeps?.(id)) continue
    policy.close(id)
    if (policy.consumes(id)) return true
  }
  return false
}

/** Palettes and workspaces do not take the user out of the Containers screen. */
export function keepsWorkbenchHidden(id: CommandId): boolean {
  return OVERLAY_COMMANDS.has(id) || id.startsWith('workspace.')
}

const commands = new Map<CommandId, Command>()

export function registerCommand(command: Command): () => void {
  commands.set(command.id, command)
  return () => {
    if (commands.get(command.id) === command) commands.delete(command.id)
  }
}

/** All registered commands, without evaluating `when` (reference lists, like the Settings shortcuts one). */
export function listAllCommands(): Command[] {
  return [...commands.values()]
}

export function listCommands(): Command[] {
  return [...commands.values()].filter((c) => c.when?.() !== false)
}

// ---------- Effective shortcuts ----------

/**
 * Effective shortcut for display (main registers them in the menu and dispatches); command missing from the map = no
 * shortcut.
 */
export function keybindingOf(command: Command): string | undefined {
  const keybindings = get().keybindings
  // `null` before the first snapshot: the command default applies.
  return keybindings ? keybindings[command.id]?.[0] : command.keybinding
}

// ---------- Recent ----------

function loadRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string').slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}

let recent = loadRecent()

/** Recently used ids, newest to oldest. */
export function recentCommandIds(): string[] {
  return recent
}

function markRecent(id: CommandId): void {
  recent = [id, ...recent.filter((r) => r !== id)].slice(0, RECENT_MAX)
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent))
  } catch {
    // no localStorage: recents last only for the session
  }
}

export async function executeCommand(id: CommandId, ...args: unknown[]): Promise<void> {
  const command = commands.get(id)
  if (!command) {
    notify(t().commands.notFound(id))
    return
  }
  if (leaveOverlays(id)) return
  if (command.when?.() === false) {
    notify(t().commands.unavailable(command.title))
    return
  }
  // Commands that open the quick input itself: in the recents they would always be on top and hide the useful ones.
  if (!OVERLAY_COMMANDS.has(id)) markRecent(id)
  await attempt(() => command.run(...args))
}
