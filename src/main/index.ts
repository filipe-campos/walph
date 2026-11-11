import { app, dialog } from 'electron'
import { join } from 'node:path'
import './window/appProtocol'
import { buildMenu, rebuildMenuIfRecentChanged } from './menu'
import { registerFsHandlers } from './ipc/fs'
import { registerWorkspaceHandlers } from './ipc/workspace'
import { stopViewWatchers } from './workspace/viewWatchers'
import { registerFilesHandlers } from './ipc/files'
import { killAllSearches, registerSearchHandlers } from './ipc/search'
import { killAllGit } from './git/killAll'
import { registerGitHandlers } from './ipc/git'
import { registerWindowHandlers } from './ipc/window'
import { registerWorkspacesHandlers } from './ipc/workspaces'
import { registerDialogHandlers } from './ipc/dialog'
import { registerTabsHandlers } from './ipc/tabs'
import { registerSettingsHandlers } from './ipc/settings'
import { registerSnippetsHandlers } from './ipc/snippets'
import { stopSnippets } from './snippets/service'
import { stopSettings } from './settings/service'
import { onBindingsChange } from './keybindings/effective'
import { onLocaleChange, t } from '@shared/i18n'
import { registerLspHandlers } from './ipc/lsp'
import { killAllLsp } from './lsp/registry'
import { registerDebugHandlers } from './ipc/debug'
import { killAllDebug } from './debug/registry'
import { registerClaudeHandlers } from './ipc/claude'
import { killAllClaude } from './claude/registry'
import { registerDockerHandlers } from './ipc/docker'
import { killAllSpawnedGroups } from './process/spawnGroup'
import { killAllTerminals } from './terminal/registry'
import { registerTerminalHandlers } from './ipc/terminal'
import { registerRecentHandlers } from './ipc/recent'
import { flushRecent, onRecentChange } from './recent/store'
import { flushSessionsSync, registerSessionHandlers } from './ipc/session'
import { schedulePruneSessions } from './session/pruneRun'
import { registerUpdateHandlers, stopUpdates } from './ipc/update'
import { registerCliHandlers } from './ipc/cli'
import { registerNotificationHandlers } from './ipc/notifications'
import { applyLoginPathAtStartup } from './env/loginPath'
import { allHosts, createWindow, focusWindow, liveContents, onWorkspaceEvent, targetHost } from './window/windows'
import { installChordShortcuts } from './keybindings/chordShortcuts'
import { openForwardedFolder } from './window/openFolder'
import { restoreWindows } from './window/restoreWindows'
import { folderFromArgv } from './workspace/parseArgs'
import { applyHiddenModeSwitches, hiddenWindows } from './window/hiddenMode'
import { registerAppProtocol, usesAppProtocol } from './window/appProtocol'
import { startHibernation, stopHibernation } from './window/hibernationController'
import { applyDevDockIcon } from './window/appIcon'

// Before ready: ensures "Walph" in the app menu and in About even outside the packaged bundle.
app.setName('Walph')

// Dev and the installed app would share the `Walph` userData and, with the lock below, `pnpm dev` would forward argv to
// the installed app and quit. In dev the userData is different (unless `--user-data-dir` already sets it, as in tests).
if (!app.isPackaged && !app.commandLine.hasSwitch('user-data-dir')) {
  app.setPath('userData', join(app.getPath('appData'), 'Walph-dev'))
}

applyHiddenModeSwitches()

// One instance per userData (tests with an isolated `--user-data-dir` stay independent). The second forwards argv to
// the first (`second-instance`) and quits: this is how `walph .` opens the folder in the already running app.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) app.quit()

// Forwards that arrive before the windows exist (`walph .` right after opening) wait for startup to finish.
let started = false
let handlersRegistered = false
const pendingForwards: Array<{ argv: string[]; cwd: string }> = []

/**
 * Failure of a detached task (nobody awaits it): it used to surface as an exception; now it shows as a dialog instead
 * of vanishing.
 */
function reportFailure(err: unknown): void {
  dialog.showErrorBox('Walph', err instanceof Error ? err.message : String(err))
}

async function handleForwarded(argv: string[], cwd: string): Promise<void> {
  // Chromium may inject flags (`--…`) into the forwarded argv: `folderFromArgv` ignores anything starting with `-`.
  const folder = folderFromArgv(argv, cwd, app.isPackaged)
  // macOS: without this the window is focused but the app stays behind the terminal that ran `walph .`.
  if (process.platform === 'darwin' && !hiddenWindows) app.focus({ steal: true })
  if (folder) {
    if (!(await openForwardedFolder(folder))) dialog.showErrorBox('Walph', t().app.errors.notAFolder(folder))
    return
  }
  const host = targetHost()
  if (host) focusWindow(host.win)
  else await restoreWindows(null)
}

app.on('second-instance', (_event, argv, cwd) => {
  if (started) handleForwarded(argv, cwd).catch(reportFailure)
  else pendingForwards.push({ argv, cwd })
})

/**
 * `start` failed midway: the app cannot stay alive without a window (and with no way to close); open an empty one and
 * release the forwards.
 */
function recoverFromStartFailure(err: unknown): void {
  reportFailure(err)
  // A window without the IPC handlers would be unusable: a failure before registration quits the app.
  if (!handlersRegistered) {
    app.quit()
    return
  }
  try {
    if (allHosts().length === 0) createWindow({ root: null })
  } catch (windowErr) {
    reportFailure(windowErr)
    app.quit()
    return
  }
  started = true
  for (const { argv, cwd } of pendingForwards.splice(0)) handleForwarded(argv, cwd).catch(reportFailure)
}

if (gotSingleInstanceLock) start().catch(recoverFromStartFailure)

async function start(): Promise<void> {
  await app.whenReady()
  app.setAboutPanelOptions({ applicationName: 'Walph', applicationVersion: app.getVersion() })
  // No Dock icon: the background app (tests) does not become the active macOS app.
  if (hiddenWindows) app.dock?.hide()
  else applyDevDockIcon()
  // Without the AppUserModelID, Windows neither shows (nor delivers clicks on) the app's notifications.
  if (process.platform === 'win32') app.setAppUserModelId('dev.walph.ide')
  if (usesAppProtocol()) registerAppProtocol()
  registerFsHandlers()
  registerWorkspaceHandlers()
  registerWorkspacesHandlers()
  registerFilesHandlers()
  registerSearchHandlers()
  registerGitHandlers()
  registerTerminalHandlers()
  registerLspHandlers()
  registerDebugHandlers()
  registerClaudeHandlers()
  registerNotificationHandlers()
  registerDockerHandlers()
  registerWindowHandlers({ newWindow: () => void createWindow({ root: null }) })
  registerRecentHandlers()
  registerSessionHandlers()
  onWorkspaceEvent((event) => {
    const wc = event.type === 'viewCreated' ? liveContents(event.ws) : null
    if (wc) installChordShortcuts(wc)
  })
  registerDialogHandlers()
  registerTabsHandlers()
  // Before the menu: reads the user's keybindings.json so the menu starts with the effective shortcuts.
  registerSettingsHandlers()
  registerSnippetsHandlers()
  buildMenu()
  onBindingsChange(buildMenu)
  onLocaleChange(buildMenu)
  onRecentChange(rebuildMenuIfRecentChanged)

  registerUpdateHandlers()
  registerCliHandlers()
  handlersRegistered = true

  startHibernation()
  // macOS: clicking the icon with no windows reopens those of the last session. Registered before restore so that a
  // failure there still leaves the app reopenable; `started` avoids restoring twice if the click comes midway.
  app.on('activate', () => {
    if (started && allHosts().length === 0) restoreWindows(null).catch(reportFailure)
  })
  // Before the windows, so git/LSP/shells start with the login shell PATH (app opened from Finder).
  if (app.isPackaged) await applyLoginPathAtStartup()
  await restoreWindows(folderFromArgv(process.argv, process.cwd(), app.isPackaged))
  started = true
  schedulePruneSessions()
  for (const { argv, cwd } of pendingForwards.splice(0)) await handleForwarded(argv, cwd).catch(reportFailure)
}

// Termination signals (pkill, Ctrl+C in `pnpm dev`, logout) become a normal exit: `app.quit()` goes through the dirty
// files guard, the session flush and `will-quit`, which kills the children (Claude, LSP, shells). SIGKILL cannot be
// handled: there is no defense against it.
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(signal, () => app.quit())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// `will-quit` (and not `before-quit`) because the dirty files guard may abort the exit.
app.on('will-quit', () => {
  // The window list was already pinned in `before-quit` (the windows have already closed here).
  stopHibernation()
  flushRecent()
  flushSessionsSync()
  killAllTerminals()
  killAllLsp()
  killAllDebug()
  killAllClaude()
  killAllSpawnedGroups()
  killAllSearches()
  killAllGit()
  void stopViewWatchers()
  void stopSettings()
  stopSnippets()
  stopUpdates()
})
