import type { MenuItemConstructorOptions } from 'electron'
import { commandTitle, isChord, isCommandAvailable, WORKSPACE_SELECT_IDS, type CommandId } from '@shared/commands'
import { t } from '@shared/i18n'
import { formatKeybinding } from '@shared/keybindingLabel'
import { pathTail } from '@shared/pathCompare'
import { omitUndefined } from '@shared/omitUndefined'
import { isMenuAccelerator } from '../keybindings/chords'
import { defaultBindings, sameBindingList, type Bindings } from '../keybindings/userKeybindings'

// How many recent folders appear in the submenu; the rest go to "More…" (palette).
export const MENU_RECENT_LIMIT = 10

interface MenuActions {
  /** Delivers the command to the active view of the focused window (or handles it in main when there is no view). */
  sendCommand(id: CommandId): void
  openRecent(path: string): void
  quit(): void
  /** Reloads the active view straight from main: if the renderer hung, the command over IPC would never arrive. */
  reloadActiveView(): void
}

export interface MenuTemplateInput {
  platform: string
  isPackaged: boolean
  appName: string
  home: string
  /** Effective shortcuts (default ← `keybindings.json`). */
  bindings: Bindings
  /** Platform default shortcuts: a `role` only applies while the effective one equals them. */
  defaults: Bindings
  recent: readonly string[]
  actions: MenuActions
}

/** Label of a folder in the menu: path with `~` in place of home; `&` escaped (on Windows it would be a mnemonic). */
function recentLabel(path: string, home: string, platform: string): string {
  const tail = pathTail(home, path, { platform })
  const sep = platform === 'win32' ? '\\' : '/'
  const short = tail === null ? path : tail.length === 0 ? '~' : `~${sep}${tail.join(sep)}`
  return short.replace(/&/g, '&&')
}

/** Item label: the menu's own when it differs from the palette, otherwise the command title. */
function menuLabel(id: CommandId, platform: string): string {
  const m = t().menu
  const select = (WORKSPACE_SELECT_IDS as readonly CommandId[]).indexOf(id)
  if (select >= 0) return m.workspace(select + 1)
  return (m.items as Partial<Record<CommandId, string>>)[id] ?? commandTitle(id, platform)
}

const idsCache = new Map<string, ReadonlySet<CommandId>>()

/** Commands that have an item in the native menu on that platform/build (independent of shortcuts and recents). */
export function menuCommandIds(platform: string, isPackaged: boolean): ReadonlySet<CommandId> {
  const key = `${platform}:${isPackaged}`
  let ids = idsCache.get(key)
  if (!ids) {
    const noop = (): void => {}
    ids = buildTemplate({
      platform,
      isPackaged,
      appName: 'Walph',
      home: '',
      bindings: defaultBindings(platform),
      defaults: defaultBindings(platform),
      recent: [],
      actions: { sendCommand: noop, openRecent: noop, quit: noop, reloadActiveView: noop }
    }).ids
    idsCache.set(key, ids)
  }
  return ids
}

/**
 * Menu template with the effective shortcuts. Chords (`Ctrl+K S`) and shortcuts with `when` are not accelerators: they
 * belong to `keybindings/chordShortcuts.ts` and the menu only shows the hint.
 */
export function buildTemplate(input: MenuTemplateInput): {
  template: MenuItemConstructorOptions[]
  ids: Set<CommandId>
} {
  const { platform, isPackaged, appName, home, bindings, defaults, actions } = input
  const isMac = platform === 'darwin'
  const m = t().menu
  const ids = new Set<CommandId>()
  const available = (id: CommandId): boolean => isCommandAvailable(id, platform, isPackaged)

  // The menu shows only the command's 1st shortcut; the others (and those that cannot be accelerators) belong to main.
  const accel = (id: CommandId): string | undefined => {
    const binding = bindings[id]?.[0]
    // Chords and shortcuts with `when` are not accelerators (the menu would fire in any focus): they belong to main.
    return binding && isMenuAccelerator(binding, 0) ? binding.key : undefined
  }

  const acceleratorOf = (id: CommandId) => omitUndefined({ accelerator: accel(id) })

  const item = (id: CommandId, click?: () => void, label = menuLabel(id, platform)): MenuItemConstructorOptions => {
    ids.add(id)
    // No accelerator (chord or `when`): show the hint in the label (the `\t` right-aligns the text, like a shortcut).
    const binding = bindings[id]?.[0]
    const hint = binding && (binding.when || isChord(binding.key)) ? `\t${formatKeybinding(binding.key, platform)}` : ''
    return { label: label + hint, ...acceleratorOf(id), click: click ?? (() => actions.sendCommand(id)) }
  }

  // Items with a `role` keep the native behavior while the shortcut is the default. If the user changed or removed the
  // shortcut, it becomes a plain item: a `role` without accelerator would register the native shortcut again,
  // ignoring the user.
  const roleItem = (
    id: CommandId,
    role: NonNullable<MenuItemConstructorOptions['role']>,
    label = menuLabel(id, platform)
  ): MenuItemConstructorOptions => {
    ids.add(id)
    // A shortcut with `when` is not an accelerator, and a `role` without accelerator would register the native key
    // in any context.
    const scoped = !!bindings[id]?.[0]?.when
    return !scoped && sameBindingList(bindings[id], defaults[id])
      ? { role, label, ...acceleratorOf(id) }
      : id === 'workbench.quit'
        ? { label, ...acceleratorOf(id), click: actions.quit }
        : item(id, undefined, label)
  }

  const settingsItems = (): MenuItemConstructorOptions[] => [
    item('workbench.openSettings'),
    item('workbench.openSettingsJson'),
    item('workbench.openWorkspaceSettings'),
    item('workbench.openKeybindings'),
    item('workbench.configureSnippets'),
    item('workbench.selectTheme')
  ]

  // Only in the packaged app (in dev the updater and `walph` would point at the Electron in node_modules).
  const updateItems = (): MenuItemConstructorOptions[] => (available('update.check') ? [item('update.check')] : [])
  const cliItems = (): MenuItemConstructorOptions[] =>
    available('cli.install') ? [item('cli.install'), item('cli.uninstall')] : []

  const recentItems = (): MenuItemConstructorOptions[] => {
    const recent = input.recent
    return [
      ...(recent.length === 0
        ? ([{ label: m.noRecent, enabled: false }] as MenuItemConstructorOptions[])
        : recent.slice(0, MENU_RECENT_LIMIT).map((path) => ({
            label: recentLabel(path, home, platform),
            click: () => actions.openRecent(path)
          }))),
      { type: 'separator' },
      { ...item('workbench.openRecent', undefined, t().common.more), enabled: recent.length > 0 },
      { ...item('workbench.clearRecent'), enabled: recent.length > 0 }
    ]
  }

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: appName,
            submenu: [
              { role: 'about', label: m.about(appName) },
              ...updateItems(),
              { type: 'separator' },
              ...settingsItems(),
              { type: 'separator' },
              ...(available('cli.install') ? [...cliItems(), { type: 'separator' } as const] : []),
              { role: 'services', label: m.services },
              { type: 'separator' },
              { role: 'hide', label: m.hide(appName) },
              { role: 'hideOthers', label: m.hideOthers },
              { role: 'unhide', label: m.showAll },
              { type: 'separator' },
              roleItem('workbench.quit', 'quit', t().commands.quitApp(appName))
            ]
          }
        ] as MenuItemConstructorOptions[])
      : []),
    {
      label: m.file,
      submenu: [
        item('workbench.newWindow'),
        { type: 'separator' },
        item('workspace.add'),
        item('workbench.openFolder'),
        item('git.clone'),
        { label: m.openRecent, submenu: recentItems() },
        { type: 'separator' },
        item('editor.save'),
        item('workbench.saveAll'),
        item('workbench.closeTab'),
        item('workbench.reopenClosedEditor'),
        item('workspace.close'),
        ...(isMac
          ? []
          : ([
              { type: 'separator' },
              { label: m.preferences, submenu: settingsItems() }
            ] as MenuItemConstructorOptions[])),
        { type: 'separator' },
        isMac && available('workbench.closeWindow')
          ? roleItem('workbench.closeWindow', 'close')
          : roleItem('workbench.quit', 'quit')
      ]
    },
    // Explicit Edit menu: `role: 'editMenu'` brings "Paste and Match Style" with ⇧⌘V (Shift+CommandOrControl+V),
    // a native shortcut that would swallow the Markdown preview one before `before-input-event`.
    {
      label: m.edit,
      submenu: [
        { role: 'undo', label: m.undo },
        { role: 'redo', label: m.redo },
        { type: 'separator' },
        { role: 'cut', label: m.cut },
        { role: 'copy', label: t().common.copy },
        { role: 'paste', label: m.paste },
        // macOS only (the Win/Linux `editMenu` did not have the item; there Ctrl+Alt = AltGr and would swallow typing).
        ...(isMac
          ? [{ role: 'pasteAndMatchStyle', label: m.pasteAndMatchStyle, accelerator: 'Alt+Shift+Cmd+V' } as const]
          : []),
        { role: 'delete', label: t().common.delete },
        { type: 'separator' },
        { role: 'selectAll', label: m.selectAll },
        { type: 'separator' },
        item('editor.insertSnippet'),
        item('emmet.expandAbbreviation')
      ]
    },
    {
      label: m.view,
      submenu: [
        item('workbench.showCommandPalette'),
        item('workbench.showUnifiedPalette'),
        { type: 'separator' },
        {
          label: m.editorLayout,
          submenu: [
            item('editor.splitRight'),
            item('editor.splitDown'),
            { type: 'separator' },
            item('editor.focusOtherGroup'),
            item('editor.focusLeftGroup'),
            item('editor.focusRightGroup'),
            item('editor.focusAboveGroup'),
            item('editor.focusBelowGroup'),
            { type: 'separator' },
            item('editor.moveToNextGroup'),
            item('editor.moveToPreviousGroup'),
            { type: 'separator' },
            item('editor.joinAllGroups'),
            item('editor.closeGroup')
          ]
        },
        item('editor.markdownPreview'),
        item('view.toggleBreadcrumbs'),
        item('view.toggleStickyScroll'),
        { type: 'separator' },
        item('view.explorer'),
        item('view.search'),
        item('search.replaceInFiles'),
        item('view.git'),
        item('view.containers'),
        item('view.debug'),
        item('view.toggleSidebar'),
        { type: 'separator' },
        item('claude.focus'),
        item('claude.newConversation'),
        item('claude.insertReference'),
        item('claude.find'),
        item('claude.toggleSidebar'),
        { type: 'separator' },
        item('view.problems'),
        item('view.output'),
        item('view.debugConsole'),
        item('terminal.toggle'),
        item('terminal.new'),
        item('terminal.newWithProfile'),
        item('terminal.split'),
        item('terminal.rename'),
        item('terminal.kill'),
        item('terminal.find'),
        { type: 'separator' },
        item('view.togglePanelMaximized'),
        item('view.togglePanelPosition'),
        { type: 'separator' },
        // No `role` on the view actions: Electron roles act on the focused `BrowserWindow`, and the window is now a
        // `BaseWindow` with views. The command goes to the active view, which calls `window:action`.
        item('view.resetZoom'),
        item('view.zoomIn'),
        item('view.zoomOut'),
        { type: 'separator' },
        roleItem('view.toggleFullScreen', 'togglefullscreen'),
        ...(available('workbench.reload') && available('workbench.toggleDevTools')
          ? ([
              { type: 'separator' },
              // Straight from main: if the active view's renderer hung, the command over IPC would never arrive.
              item('workbench.reload', actions.reloadActiveView),
              item('workbench.toggleDevTools')
            ] as MenuItemConstructorOptions[])
          : [])
      ]
    },
    {
      label: m.go,
      submenu: [
        item('workbench.quickOpen'),
        item('editor.goToLine'),
        item('editor.goToSymbol'),
        item('workbench.showAllSymbols'),
        item('editor.focusBreadcrumbs'),
        { type: 'separator' },
        item('editor.goToDefinition'),
        item('editor.goToReferences'),
        item('editor.goToImplementation'),
        item('editor.goToTypeDefinition'),
        item('editor.goToDeclaration'),
        { type: 'separator' },
        item('editor.peekDefinition'),
        item('editor.peekImplementation'),
        item('editor.peekReferences'),
        item('editor.showCallHierarchy'),
        item('editor.showTypeHierarchy'),
        { type: 'separator' },
        item('workbench.navigateBack'),
        item('workbench.navigateForward'),
        { type: 'separator' },
        item('search.nextResult'),
        item('search.previousResult'),
        { type: 'separator' },
        item('editor.nextSymbolHighlight'),
        item('editor.previousSymbolHighlight')
      ]
    },
    {
      label: m.run,
      submenu: [
        item('debug.start'),
        item('debug.runWithoutDebugging'),
        item('debug.stop'),
        item('debug.restart'),
        { type: 'separator' },
        item('debug.selectConfiguration'),
        item('debug.openLaunchJson'),
        { type: 'separator' },
        item('debug.continue'),
        item('debug.pause'),
        item('debug.stepOver'),
        item('debug.stepInto'),
        item('debug.stepOut'),
        { type: 'separator' },
        item('debug.toggleBreakpoint'),
        item('debug.addConditionalBreakpoint'),
        item('debug.removeAllBreakpoints')
      ]
    },
    {
      label: m.workspaces,
      submenu: [
        item('workspace.next'),
        item('workspace.previous'),
        { type: 'separator' },
        ...WORKSPACE_SELECT_IDS.map((id) => item(id))
      ]
    },
    windowMenu(platform),
    {
      role: 'help',
      label: m.help,
      submenu: [
        // macOS: update and command live in the app menu; Win/Linux have no app menu, so they go to Help.
        ...(isMac || !available('update.check')
          ? []
          : ([
              ...updateItems(),
              { type: 'separator' },
              ...cliItems(),
              { type: 'separator' }
            ] as MenuItemConstructorOptions[])),
        item('help.reportIssue'),
        item('help.support')
      ]
    }
  ]

  return { template, ids }
}

/**
 * Window menu. On macOS the native role is enough. On Windows/Linux the `windowMenu` role includes `close` with the
 * Ctrl+W accelerator, which would close the window: `workbench.closeTab` (Ctrl+W) is no longer an accelerator (it has
 * `when: !claudeFocus`) and the key is held by `before-input-event`, whose `preventDefault` also blocks the menu
 * shortcuts. But if the user removes both Ctrl+W actions (close tab and close session), the native `close` would
 * steal it again; so only minimize and zoom go here (closing the window is via the title bar button or "Quit").
 */
function windowMenu(platform: string): MenuItemConstructorOptions {
  const m = t().menu
  if (platform === 'darwin')
    // With `submenu` macOS still appends the window list, but the items stop coming in the system language.
    return {
      role: 'windowMenu',
      label: m.window,
      submenu: [
        { role: 'minimize', label: m.minimize },
        { role: 'zoom', label: m.zoom },
        { type: 'separator' },
        { role: 'front', label: m.bringAllToFront }
      ]
    }
  return {
    label: m.window,
    submenu: [
      { role: 'minimize', label: m.minimize },
      { role: 'zoom', label: m.zoom }
    ]
  }
}
