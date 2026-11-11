import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SettingsSnapshot } from '@shared/settings'
import type * as Binding from '../settings/binding'
import type * as State from '../settings/state'
import { fakeWebContents, type FakeWebContents } from '../testing/fakeIpc'
import { makeRealTempDir } from '../testing/testEnv'

async function settingsModules(): Promise<typeof State & typeof Binding> {
  return { ...(await import('../settings/state')), ...(await import('../settings/binding')) }
}

const harness = await vi.hoisted(async () => (await import('../testing/fakeIpc')).createIpcHarness())
let userData = ''
// Folder main registered for the view (`getWindowRoot`).
let ownedRoot: string | null = null

let rootChanged: ((wc: unknown, root: string | null) => void) | null = null

vi.mock('../window/windows', () => ({
  getWindowRoot: () => ownedRoot,
  onWindowRootChange: (cb: (wc: unknown, root: string | null) => void) => {
    rootChanged = cb
    return () => undefined
  }
}))

vi.mock('electron', () => ({
  app: { getPath: () => userData },
  ...harness.electronMock
}))

function lastSnapshot(wc: FakeWebContents): SettingsSnapshot {
  const calls = wc.send.mock.calls.filter((c) => c[0] === 'settings:changed')
  return calls[calls.length - 1][1] as SettingsSnapshot
}

describe('settings:setValue / settings:resetValue', () => {
  let root: string
  let wc: FakeWebContents
  let stop: () => Promise<void>
  const userFile = (): string => join(userData, 'settings.json')
  const wsFile = (): string => join(root, '.walph', 'settings.json')
  const call = (channel: string, ...args: unknown[]): Promise<unknown> => harness.invoke(channel, wc, ...args)
  // Main changes the view folder (`setWindowRoot`) and only then the renderer asks for the snapshot.
  const openRoot = async (folder = root): Promise<SettingsSnapshot> => {
    ownedRoot = folder
    rootChanged!(wc, folder)
    return (await call('settings:setWorkspace', folder)) as SettingsSnapshot
  }

  beforeEach(async () => {
    userData = makeRealTempDir('walph-settings-ud-')
    root = makeRealTempDir('walph-settings-ws-')
    ownedRoot = null
    wc = fakeWebContents()
    harness.reset()
    vi.resetModules()
    const mod = await import('./settings')
    stop = (await import('../settings/service')).stopSettings
    mod.registerSettingsHandlers()
    // Connects the window (no folder): only connected windows receive `settings:changed`.
    await call('settings:setWorkspace', null)
  })

  afterEach(async () => {
    await stop()
    rmSync(userData, { recursive: true, force: true })
    rmSync(root, { recursive: true, force: true })
  })

  describe('resetValue', () => {
    it('removes the key from the user settings.json preserving comments and the other keys', async () => {
      writeFileSync(userFile(), '{\n  // size\n  "editor.fontSize": 18,\n  // tabs\n  "editor.tabSize": 4\n}\n')
      await call('settings:resetValue', 'user', 'editor.fontSize')
      const text = readFileSync(userFile(), 'utf8')
      expect(text).not.toContain('editor.fontSize')
      expect(text).toContain('"editor.tabSize": 4')
      expect(text).toContain('// tabs')
      const snap = lastSnapshot(wc)
      expect('editor.fontSize' in snap.layers.user).toBe(false)
      expect(snap.layers.user['editor.tabSize']).toBe(4)
    })

    it('does not create the file when it does not exist', async () => {
      await call('settings:resetValue', 'user', 'editor.fontSize')
      expect(existsSync(userFile())).toBe(false)
    })

    it('leaves the text byte-for-byte identical when the key is missing', async () => {
      const original = '{\r\n  // x\r\n  "editor.tabSize": 4,\r\n}\r\n'
      writeFileSync(userFile(), original)
      await call('settings:resetValue', 'user', 'editor.fontSize')
      expect(readFileSync(userFile(), 'utf8')).toBe(original)
    })

    it('removes from the workspace .walph/settings.json and updates layers.workspace and workspaceKeys', async () => {
      mkdirSync(join(root, '.walph'))
      writeFileSync(wsFile(), '{\n  "editor.fontSize": 20,\n  "editor.tabSize": 8\n}\n')
      const first = await openRoot()
      expect(first.workspaceKeys.sort()).toEqual(['editor.fontSize', 'editor.tabSize'])

      await call('settings:resetValue', 'workspace', 'editor.fontSize')
      expect(readFileSync(wsFile(), 'utf8')).not.toContain('editor.fontSize')
      const snap = lastSnapshot(wc)
      expect(snap.workspaceKeys).toEqual(['editor.tabSize'])
      expect(snap.layers.workspace).toEqual({ 'editor.tabSize': 8 })
    })

    it('refuses a user-only key in the workspace layer', async () => {
      await openRoot()
      await expect(call('settings:resetValue', 'workspace', 'terminal.shell')).rejects.toThrow(
        '"terminal.shell" só pode ser alterado nas configurações do usuário.'
      )
    })

    it('setWorkspace refuses a folder different from the one main registered for the view', async () => {
      const other = makeRealTempDir('walph-settings-other-')
      try {
        ownedRoot = root
        await expect(call('settings:setWorkspace', other)).rejects.toThrow('diferente da pasta aberta')
        ownedRoot = null
        await expect(call('settings:setWorkspace', root)).rejects.toThrow('diferente da pasta aberta')
        // Nothing was written to the refused folder.
        await expect(call('settings:setValue', 'workspace', 'editor.fontSize', 20)).rejects.toThrow(
          'Abra uma pasta para alterar as configurações do workspace.'
        )
        expect(existsSync(join(other, '.walph'))).toBe(false)
      } finally {
        rmSync(other, { recursive: true, force: true })
      }
    })

    it('setWorkspace accepts the registered folder (even with another case/trailing slash) and null', async () => {
      ownedRoot = root
      await expect(call('settings:setWorkspace', root)).resolves.toBeDefined()
      await expect(call('settings:setWorkspace', `${root}/`)).resolves.toBeDefined()
      await expect(call('settings:setWorkspace', null)).resolves.toBeDefined()
    })

    it('refuses the workspace layer without an open folder', async () => {
      await expect(call('settings:resetValue', 'workspace', 'editor.fontSize')).rejects.toThrow(
        'Abra uma pasta para alterar as configurações do workspace.'
      )
    })

    it('refuses a file with a syntax error and does not change it', async () => {
      const broken = '{ "editor.fontSize": 18, "editor.tabSize": '
      writeFileSync(userFile(), broken)
      await expect(call('settings:resetValue', 'user', 'editor.fontSize')).rejects.toThrow(/^Corrija o /)
      expect(readFileSync(userFile(), 'utf8')).toBe(broken)
    })

    it('refuses an invalid layer and an unknown key', async () => {
      await expect(call('settings:resetValue', 'global', 'editor.fontSize')).rejects.toThrow(
        'Camada de configuração inválida.'
      )
      await expect(call('settings:resetValue', 'user', 'does.not.exist')).rejects.toThrow(
        'Configuração desconhecida: "does.not.exist".'
      )
    })
  })

  describe('setValue', () => {
    it('writes to the user and exposes the value in layers.user without touching layers.workspace', async () => {
      await call('settings:setValue', 'user', 'editor.fontSize', 19)
      expect(JSON.parse(readFileSync(userFile(), 'utf8'))['editor.fontSize']).toBe(19)
      const snap = lastSnapshot(wc)
      expect(snap.layers.user['editor.fontSize']).toBe(19)
      expect(snap.layers.workspace).toEqual({})
      expect(snap.settings['editor.fontSize']).toBe(19)
    })

    it('writes to the workspace and the effective value comes from it; layers.user keeps the user one', async () => {
      await openRoot()
      await call('settings:setValue', 'user', 'editor.fontSize', 19)
      await call('settings:setValue', 'workspace', 'editor.fontSize', 22)
      expect(existsSync(wsFile())).toBe(true)
      const snap = lastSnapshot(wc)
      expect(snap.layers.user['editor.fontSize']).toBe(19)
      expect(snap.layers.workspace['editor.fontSize']).toBe(22)
      expect(snap.settings['editor.fontSize']).toBe(22)
      expect(snap.workspaceKeys).toContain('editor.fontSize')
    })

    it('refuses an invalid value without writing', async () => {
      await expect(call('settings:setValue', 'user', 'editor.fontSize', 'large')).rejects.toThrow(/^Valor inválido/)
      expect(existsSync(userFile())).toBe(false)
    })

    it.skipIf(process.platform === 'win32')(
      'refuses .walph/settings.json as a dangling link pointing outside the folder',
      async () => {
        await openRoot()
        const outside = join(userData, 'outside.json')
        mkdirSync(join(root, '.walph'))
        symlinkSync(outside, wsFile())
        await expect(call('settings:setValue', 'workspace', 'editor.fontSize', 22)).rejects.toThrow()
        expect(existsSync(outside)).toBe(false)
      }
    )
  })

  describe('folder binding by main', () => {
    const writeWs = (dir: string, json: string): void => {
      mkdirSync(join(dir, '.walph'), { recursive: true })
      writeFileSync(join(dir, '.walph', 'settings.json'), json)
    }

    it('a folder change in main binds the layer without the renderer asking and notifies the listeners', async () => {
      writeWs(root, '{ "files.watcherExclude": { "**/dist": true } }')
      const mod = await settingsModules()
      const seen: Array<Record<string, unknown>> = []
      mod.onSettingsChange((target) => seen.push(mod.getEffectiveSettings(target) as never))

      ownedRoot = root
      await mod.bindView(wc as never, root)

      expect(seen).toHaveLength(1)
      expect(seen[0]['files.watcherExclude']).toMatchObject({ '**/dist': true })
      expect(lastSnapshot(wc).workspaceKeys).toEqual(['files.watcherExclude'])
    })

    it('changing folders releases the previous layer and reads the new one', async () => {
      const other = makeRealTempDir('walph-settings-other-')
      try {
        writeWs(root, '{ "editor.fontSize": 20 }')
        writeWs(other, '{ "editor.tabSize": 8 }')
        const first = await openRoot(root)
        expect(first.layers.workspace).toEqual({ 'editor.fontSize': 20 })

        const second = await openRoot(other)
        expect(second.layers.workspace).toEqual({ 'editor.tabSize': 8 })
        expect(second.settings['editor.fontSize']).not.toBe(20)
        expect(lastSnapshot(wc).layers.workspace).toEqual({ 'editor.tabSize': 8 })

        ownedRoot = null
        rootChanged!(wc, null)
        const none = (await call('settings:setWorkspace', null)) as SettingsSnapshot
        expect(none.layers.workspace).toEqual({})
      } finally {
        rmSync(other, { recursive: true, force: true })
      }
    })

    it('bindView waits for the first read of the new folder', async () => {
      writeWs(root, '{ "editor.fontSize": 21 }')
      const mod = await settingsModules()
      ownedRoot = root
      const ready = mod.bindView(wc as never, root)
      await ready
      expect(mod.getEffectiveSettings(wc as never)['editor.fontSize']).toBe(21)
    })
  })

  describe('settings:openFile', () => {
    it('creates the workspace file from the template', async () => {
      await openRoot()
      const path = (await call('settings:openFile', 'workspace')) as string
      expect(path).toBe(wsFile())
      expect(readFileSync(path, 'utf8')).toContain('//')
    })

    it('does not overwrite an existing file', async () => {
      mkdirSync(join(root, '.walph'))
      writeFileSync(wsFile(), '{ "editor.tabSize": 3 }')
      await openRoot()
      await call('settings:openFile', 'workspace')
      expect(readFileSync(wsFile(), 'utf8')).toBe('{ "editor.tabSize": 3 }')
    })

    it.skipIf(process.platform === 'win32')(
      'refuses to create through a .walph pointing outside the folder',
      async () => {
        const outside = makeRealTempDir('walph-settings-outside-')
        try {
          symlinkSync(outside, join(root, '.walph'), 'dir')
          await openRoot()
          await expect(call('settings:openFile', 'workspace')).rejects.toThrow(/fora da pasta/)
          expect(existsSync(join(outside, 'settings.json'))).toBe(false)
        } finally {
          rmSync(outside, { recursive: true, force: true })
        }
      }
    )

    it.skipIf(process.platform === 'win32')(
      'opens the user settings.json that is a dangling link, without creating the target',
      async () => {
        const alvo = join(userData, 'dotfiles', 'settings.json')
        symlinkSync(alvo, userFile())
        await expect(call('settings:openFile', 'user')).resolves.toBe(userFile())
        expect(existsSync(alvo)).toBe(false)
      }
    )
  })
})
