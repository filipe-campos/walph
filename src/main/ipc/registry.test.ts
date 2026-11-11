import { rmSync } from 'node:fs'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '@shared/ipc'
import { registerClaudeHandlers } from './claude'
import { registerCliHandlers } from './cli'
import { registerDebugHandlers } from './debug'
import { registerDialogHandlers } from './dialog'
import { registerDockerHandlers } from './docker'
import { registerFilesHandlers } from './files'
import { registerFsHandlers } from './fs'
import { registerGitHandlers } from './git'
import { registerLspHandlers } from './lsp'
import { registerNotificationHandlers } from './notifications'
import { registerRecentHandlers } from './recent'
import { registerSearchHandlers } from './search'
import { registerSessionHandlers } from './session'
import { registerSettingsHandlers } from './settings'
import { registerSnippetsHandlers } from './snippets'
import { stopSnippets } from '../snippets/service'
import { stopSettings } from '../settings/service'
import { registerTabsHandlers } from './tabs'
import { registerTerminalHandlers } from './terminal'
import { registerUpdateHandlers } from './update'
import { registerWindowHandlers } from './window'
import { registerWorkspaceHandlers } from './workspace'
import { registerWorkspacesHandlers } from './workspaces'

const harness = await vi.hoisted(async () => (await import('../testing/fakeIpc')).createIpcHarness())
const userData = await vi.hoisted(async () => (await import('../testing/testEnv')).makeRealTempDir('walph-registry-'))

// Everything in electron besides `ipcMain` and `app.getPath` is an inert stub: all that matters here is which channels
// each `register*Handlers` opens.
vi.mock('electron', () => {
  const inert = (own: Record<PropertyKey, unknown> = {}): unknown =>
    new Proxy(function () {}, {
      get: (_target, key) =>
        key in own ? own[key] : key === 'then' ? undefined : key === Symbol.toPrimitive ? () => '' : inert(),
      apply: () => inert(),
      construct: () => inert() as object
    })
  return new Proxy(
    {},
    {
      has: () => true,
      get: (_target, key) =>
        key === 'ipcMain'
          ? harness.electronMock.ipcMain
          : key === 'app'
            ? inert({ getPath: () => userData, isPackaged: false })
            : key === 'then'
              ? undefined
              : inert()
    }
  )
})

afterAll(async () => {
  await stopSettings()
  stopSnippets()
  rmSync(userData, { recursive: true, force: true })
})

describe('IPC channels', () => {
  it('every contract channel has a handler and every handler is in the contract', () => {
    registerClaudeHandlers()
    registerCliHandlers()
    registerDebugHandlers()
    registerDialogHandlers()
    registerDockerHandlers()
    registerFilesHandlers()
    registerFsHandlers()
    registerGitHandlers()
    registerLspHandlers()
    registerNotificationHandlers()
    registerRecentHandlers()
    registerSearchHandlers()
    registerSessionHandlers()
    registerSettingsHandlers()
    registerSnippetsHandlers()
    registerTabsHandlers()
    registerTerminalHandlers()
    registerUpdateHandlers()
    registerWindowHandlers({ newWindow: () => undefined })
    registerWorkspaceHandlers()
    registerWorkspacesHandlers()

    const registered = harness.registered()
    expect(registered.invoke).toEqual([...IPC_CHANNELS.invoke].sort())
    expect(registered.send).toEqual([...IPC_CHANNELS.send].sort())
  })
})
