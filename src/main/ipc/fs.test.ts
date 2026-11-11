import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeRealTempDir } from '../testing/testEnv'
import { fakeWebContents, type FakeWebContents } from '../testing/fakeIpc'

const harness = await vi.hoisted(async () => (await import('../testing/fakeIpc')).createIpcHarness())
// Folder main registered for the requesting view.
let ownedRoot: string | null = null
const trashItem = vi.fn((_path: string) => Promise.resolve())
const rootListeners: Array<(wc: unknown) => void> = []

vi.mock('../window/windows', () => ({
  getWindowRoot: () => ownedRoot,
  windowOf: () => null,
  onWindowRootChange: (cb: (wc: unknown) => void) => void rootListeners.push(cb)
}))
vi.mock('electron', () => ({
  clipboard: { writeText: vi.fn() },
  shell: { trashItem: (path: string) => trashItem(path), showItemInFolder: vi.fn() },
  dialog: {},
  Menu: {},
  ...harness.electronMock
}))

let view: FakeWebContents
const call = (channel: string, ...args: unknown[]): Promise<unknown> => harness.invoke(channel, view, ...args)

describe('explorer mutations restricted to the view folder', () => {
  let base: string
  let root: string
  let outside: string

  beforeEach(async () => {
    base = makeRealTempDir('walph-fs-ipc-')
    root = join(base, 'ws')
    outside = join(base, 'outside')
    mkdirSync(join(root, 'src'), { recursive: true })
    mkdirSync(outside)
    writeFileSync(join(root, 'a.txt'), 'a')
    writeFileSync(join(outside, 'b.txt'), 'b')
    // Shortcut inside the folder pointing outside.
    symlinkSync(outside, join(root, 'link'), 'junction')
    ownedRoot = root
    view = fakeWebContents()
    rootListeners.length = 0
    trashItem.mockClear()
    harness.reset()
    vi.resetModules()
    const mod = await import('./fs')
    mod.registerFsHandlers()
  })

  afterEach(() => {
    rmSync(base, { recursive: true, force: true })
  })

  describe('fs:createFile / fs:createDir', () => {
    it('creates inside the folder (at the root and in a subfolder)', async () => {
      await expect(call('fs:createFile', root, 'new.txt')).resolves.toBe(join(root, 'new.txt'))
      await expect(call('fs:createDir', join(root, 'src'), 'lib')).resolves.toBe(join(root, 'src', 'lib'))
      expect(existsSync(join(root, 'new.txt'))).toBe(true)
      expect(existsSync(join(root, 'src', 'lib'))).toBe(true)
    })

    it('refuses a folder outside the open folder', async () => {
      await expect(call('fs:createFile', outside, 'x.txt')).rejects.toThrow(/fora da pasta aberta/)
      await expect(call('fs:createDir', outside, 'x')).rejects.toThrow(/fora da pasta aberta/)
      expect(existsSync(join(outside, 'x.txt'))).toBe(false)
      expect(existsSync(join(outside, 'x'))).toBe(false)
    })

    it('refuses to create through a symlink leaving the folder', async () => {
      await expect(call('fs:createFile', join(root, 'link'), 'x.txt')).rejects.toThrow(/fora da pasta aberta/)
      expect(existsSync(join(outside, 'x.txt'))).toBe(false)
    })

    it('refuses without an open folder', async () => {
      ownedRoot = null
      await expect(call('fs:createFile', root, 'x.txt')).rejects.toThrow('Nenhuma pasta aberta.')
    })
  })

  describe('fs:copy', () => {
    const read = (p: string): string => readFileSync(p, 'utf8')

    it('copies an outside file into the folder keeping the name', async () => {
      await expect(call('fs:copy', join(outside, 'b.txt'), join(root, 'src'))).resolves.toBe(join(root, 'src', 'b.txt'))
      expect(read(join(root, 'src', 'b.txt'))).toBe('b')
      expect(existsSync(join(outside, 'b.txt'))).toBe(true)
    })

    it('name taken: uses "copy" then "copy 2", without overwriting', async () => {
      await expect(call('fs:copy', join(root, 'a.txt'), root)).resolves.toBe(join(root, 'a copy.txt'))
      await expect(call('fs:copy', join(root, 'a.txt'), root)).resolves.toBe(join(root, 'a copy 2.txt'))
      expect(read(join(root, 'a.txt'))).toBe('a')
    })

    it('copies a whole folder (recursive)', async () => {
      writeFileSync(join(root, 'src', 'x.ts'), 'x')
      await expect(call('fs:copy', join(root, 'src'), root)).resolves.toBe(join(root, 'src copy'))
      expect(read(join(root, 'src copy', 'x.ts'))).toBe('x')
    })

    it('preserves a relative symlink and treats a broken link as a taken name', async () => {
      mkdirSync(join(root, 'pkg'))
      writeFileSync(join(root, 'pkg', 'real.txt'), 'r')
      symlinkSync('real.txt', join(root, 'pkg', 'rel.txt'))
      const copy = await call('fs:copy', join(root, 'pkg'), join(root, 'src'))
      expect(copy).toBe(join(root, 'src', 'pkg'))
      expect(readlinkSync(join(root, 'src', 'pkg', 'rel.txt'))).toBe('real.txt')
      symlinkSync('nothing', join(root, 'src', 'broken'))
      await expect(call('fs:copy', join(root, 'a.txt'), join(root, 'src'))).resolves.toBe(join(root, 'src', 'a.txt'))
      writeFileSync(join(outside, 'broken'), 'x')
      symlinkSync('nothing', join(root, 'broken'))
      await expect(call('fs:copy', join(outside, 'broken'), root)).resolves.toBe(join(root, 'broken copy'))
    })

    it('refuses a folder into itself or a descendant', async () => {
      mkdirSync(join(root, 'src', 'sub'))
      await expect(call('fs:copy', join(root, 'src'), join(root, 'src'))).rejects.toThrow(/dentro dela mesma/)
      await expect(call('fs:copy', join(root, 'src'), join(root, 'src', 'sub'))).rejects.toThrow(/dentro dela mesma/)
    })

    it('refuses a destination outside the folder and a missing source', async () => {
      await expect(call('fs:copy', join(root, 'a.txt'), outside)).rejects.toThrow(/fora da pasta aberta/)
      await expect(call('fs:copy', join(root, 'does-not-exist'), root)).rejects.toThrow(/não existe mais/)
      await expect(call('fs:copy', 'relative', root)).rejects.toThrow(/caminho absoluto/)
    })
  })

  describe('fs:readImage', () => {
    const PNG = Buffer.from('89504e470d0a1a0a', 'hex')

    it('reads an image inside and outside the open folder', async () => {
      writeFileSync(join(root, 'a.png'), PNG)
      writeFileSync(join(outside, 'b.PNG'), PNG)
      const url = `data:image/png;base64,${PNG.toString('base64')}`
      await expect(call('fs:readImage', join(root, 'a.png'))).resolves.toBe(url)
      await expect(call('fs:readImage', join(outside, 'b.PNG'))).resolves.toBe(url)
    })

    it('refuses relative, non-image, folder and missing', async () => {
      await expect(call('fs:readImage', 'a.png')).rejects.toThrow(/caminho absoluto/)
      await expect(call('fs:readImage', join(root, 'a.txt'))).rejects.toThrow(/não suportado/)
      mkdirSync(join(root, 'folder.png'))
      await expect(call('fs:readImage', join(root, 'folder.png'))).rejects.toThrow(/não é um arquivo/)
      await expect(call('fs:readImage', join(root, 'x.png'))).rejects.toThrow(/não encontrada/)
    })
  })

  describe('fs:rename', () => {
    it('renames inside the folder', async () => {
      await expect(call('fs:rename', join(root, 'a.txt'), 'c.txt')).resolves.toBe(join(root, 'c.txt'))
      expect(existsSync(join(root, 'c.txt'))).toBe(true)
    })

    it('refuses an item outside the open folder', async () => {
      await expect(call('fs:rename', join(outside, 'b.txt'), 'c.txt')).rejects.toThrow(/fora da pasta aberta/)
      expect(existsSync(join(outside, 'b.txt'))).toBe(true)
    })

    it('refuses an item inside a symlink leaving the folder', async () => {
      await expect(call('fs:rename', join(root, 'link', 'b.txt'), 'c.txt')).rejects.toThrow(/fora da pasta aberta/)
      expect(existsSync(join(outside, 'b.txt'))).toBe(true)
    })

    it('renames the symlink itself (not the target)', async () => {
      await expect(call('fs:rename', join(root, 'link'), 'shortcut')).resolves.toBe(join(root, 'shortcut'))
      expect(existsSync(outside)).toBe(true)
    })

    it('refuses the open folder itself', async () => {
      await expect(call('fs:rename', root, 'other')).rejects.toThrow(/Não é possível alterar a pasta aberta/)
      expect(existsSync(root)).toBe(true)
    })
  })

  describe('fs:trash', () => {
    it('sends an item inside the folder to the trash', async () => {
      await call('fs:trash', join(root, 'a.txt'))
      expect(trashItem).toHaveBeenCalledWith(join(root, 'a.txt'))
    })

    it('sends the symlink itself, not the target', async () => {
      await call('fs:trash', join(root, 'link'))
      expect(trashItem).toHaveBeenCalledWith(join(root, 'link'))
    })

    it('refuses an item outside the folder, inside a symlink leaving it and the folder itself', async () => {
      await expect(call('fs:trash', join(outside, 'b.txt'))).rejects.toThrow(/fora da pasta aberta/)
      await expect(call('fs:trash', join(root, 'link', 'b.txt'))).rejects.toThrow(/fora da pasta aberta/)
      await expect(call('fs:trash', root)).rejects.toThrow(/Não é possível alterar a pasta aberta/)
      await expect(call('fs:trash', join(root, '..', 'outside'))).rejects.toThrow(/fora da pasta aberta/)
      expect(trashItem).not.toHaveBeenCalled()
    })

    it('refuses without an open folder and a relative path', async () => {
      await expect(call('fs:trash', 'a.txt')).rejects.toThrow(/caminho absoluto/)
      ownedRoot = null
      await expect(call('fs:trash', join(root, 'a.txt'))).rejects.toThrow('Nenhuma pasta aberta.')
      expect(trashItem).not.toHaveBeenCalled()
    })
  })

  describe('folder opened through a symlink', () => {
    let alias: string
    beforeEach(() => {
      alias = join(base, 'alias')
      symlinkSync(root, alias, 'junction')
      ownedRoot = alias
    })

    it('a path in the real spelling comes back in the window spelling', async () => {
      await expect(call('fs:createFile', root, 'new.txt')).resolves.toBe(join(alias, 'new.txt'))
      await expect(call('fs:rename', join(root, 'a.txt'), 'c.txt')).resolves.toBe(join(alias, 'c.txt'))
      expect(existsSync(join(root, 'c.txt'))).toBe(true)
    })

    it('refuses the folder itself by its real spelling and outside it', async () => {
      await expect(call('fs:trash', root)).rejects.toThrow(/fora da pasta aberta/)
      await expect(call('fs:createFile', outside, 'x.txt')).rejects.toThrow(/fora da pasta aberta/)
      expect(trashItem).not.toHaveBeenCalled()
    })
  })

  describe('reads stay free', () => {
    it('fs:exists and fs:readDir accept paths outside the folder', async () => {
      await expect(call('fs:exists', join(outside, 'b.txt'))).resolves.toBe(true)
      const entries = (await call('fs:readDir', outside)) as { name: string }[]
      expect(entries.map((e) => e.name)).toEqual(['b.txt'])
    })
  })

  describe('fs:createFile with a taken destination', () => {
    it('refuses without overwriting', async () => {
      await expect(call('fs:createFile', root, 'a.txt')).rejects.toThrow(/Já existe/)
      expect(readFileSync(join(root, 'a.txt'), 'utf8')).toBe('a')
    })
  })

  describe('fs:readFile', () => {
    it('reads text', async () => {
      await expect(call('fs:readFile', join(root, 'a.txt'))).resolves.toBe('a')
    })

    it.skipIf(process.platform === 'win32')('refuses a FIFO without hanging', async () => {
      const fifo = join(root, 'pipe')
      execFileSync('mkfifo', [fifo])
      await expect(call('fs:readFile', fifo)).rejects.toThrow('O caminho não é um arquivo.')
    })

    it('refuses a file above the editor limit', async () => {
      writeFileSync(join(root, 'grande.txt'), Buffer.alloc(10 * 1024 * 1024 + 1, 97))
      await expect(call('fs:readFile', join(root, 'grande.txt'))).rejects.toThrow(/grande demais/)
    })
  })
  describe('fs:writeFile only writes what main recognizes', () => {
    const read = (p: string): string => readFileSync(p, 'utf8')

    it('writes inside the view folder, including a new file and a folder that disappeared', async () => {
      await call('fs:writeFile', join(root, 'a.txt'), 'new')
      await call('fs:writeFile', join(root, 'deep', 'x', 'n.txt'), 'n')
      expect(read(join(root, 'a.txt'))).toBe('new')
      expect(read(join(root, 'deep', 'x', 'n.txt'))).toBe('n')
    })

    it('refuses an arbitrary outside path, even an existing one, and writes nothing', async () => {
      await expect(call('fs:writeFile', join(outside, 'b.txt'), 'x')).rejects.toThrow(/fora da pasta aberta/)
      await expect(call('fs:writeFile', join(outside, 'new.txt'), 'x')).rejects.toThrow(/fora da pasta aberta/)
      expect(read(join(outside, 'b.txt'))).toBe('b')
      expect(existsSync(join(outside, 'new.txt'))).toBe(false)
    })

    it('refuses to write through a folder symlink leaving it', async () => {
      await expect(call('fs:writeFile', join(root, 'link', 'b.txt'), 'x')).rejects.toThrow(/fora da pasta aberta/)
      expect(read(join(outside, 'b.txt'))).toBe('b')
    })

    it('writes an outside file main read for the view (readText)', async () => {
      await expect(call('fs:readText', join(outside, 'b.txt'))).resolves.toMatchObject({ text: 'b' })
      await call('fs:writeFile', join(outside, 'b.txt'), 'edited')
      expect(read(join(outside, 'b.txt'))).toBe('edited')
    })

    it('a read inside the folder is not recorded (does not spend the cap of the outside ones)', async () => {
      await call('fs:readText', join(root, 'a.txt'))
      ownedRoot = null
      await expect(call('fs:writeFile', join(root, 'a.txt'), 'x')).rejects.toThrow(/fora da pasta aberta/)
    })

    it('a failing readText grants nothing', async () => {
      await expect(call('fs:readText', join(outside, 'does-not-exist.txt'))).rejects.toThrow()
      await expect(call('fs:writeFile', join(outside, 'does-not-exist.txt'), 'x')).rejects.toThrow(
        /fora da pasta aberta/
      )
    })

    it('readFile (display only) does not grant the write', async () => {
      await call('fs:readFile', join(outside, 'b.txt'))
      await expect(call('fs:writeFile', join(outside, 'b.txt'), 'x')).rejects.toThrow(/fora da pasta aberta/)
    })

    it('the grant is per view: another view does not write what this one read', async () => {
      await call('fs:readText', join(outside, 'b.txt'))
      const other = fakeWebContents()
      await expect(harness.invoke('fs:writeFile', other, join(outside, 'b.txt'), 'x')).rejects.toThrow(
        /fora da pasta aberta/
      )
      expect(read(join(outside, 'b.txt'))).toBe('b')
    })

    it('a view reload or close discards the grants', async () => {
      await call('fs:readText', join(outside, 'b.txt'))
      view.emit('did-navigate')
      await expect(call('fs:writeFile', join(outside, 'b.txt'), 'x')).rejects.toThrow(/fora da pasta aberta/)
    })

    it('a changed folder discards the grants', async () => {
      await call('fs:readText', join(outside, 'b.txt'))
      for (const cb of rootListeners) cb(view)
      await expect(call('fs:writeFile', join(outside, 'b.txt'), 'x')).rejects.toThrow(/fora da pasta aberta/)
      // reading again (the tab of the new folder) grants it
      await call('fs:readText', join(outside, 'b.txt'))
      await call('fs:writeFile', join(outside, 'b.txt'), 'ok')
    })

    it('without an open folder, only what was read counts', async () => {
      ownedRoot = null
      await expect(call('fs:writeFile', join(root, 'a.txt'), 'x')).rejects.toThrow(/fora da pasta aberta/)
      await call('fs:readText', join(root, 'a.txt'))
      await call('fs:writeFile', join(root, 'a.txt'), 'y')
      expect(read(join(root, 'a.txt'))).toBe('y')
    })

    it.skipIf(process.platform === 'win32')(
      'a read file that becomes a link to another destination is refused',
      async () => {
        const file = join(outside, 'l.txt')
        writeFileSync(file, 'l')
        await call('fs:readText', file)
        rmSync(file)
        symlinkSync(join(base, 'target.txt'), file)
        await expect(call('fs:writeFile', file, 'x')).rejects.toThrow(/outro destino/)
        expect(existsSync(join(base, 'target.txt'))).toBe(false)
      }
    )

    it('an outside file renamed into the folder (folder rule) writes', async () => {
      await call('fs:readText', join(outside, 'b.txt'))
      await call('fs:copy', join(outside, 'b.txt'), root)
      await call('fs:writeFile', join(root, 'b.txt'), 'inside')
      expect(read(join(root, 'b.txt'))).toBe('inside')
    })
  })
})
