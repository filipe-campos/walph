import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COMMAND_IDS, type CommandId } from '@shared/commands'
import type * as RegistryModule from './registry'

const notify = vi.fn()
const storeState = {
  keybindings: null as Partial<Record<CommandId, string[]>> | null
}
vi.mock('../store', () => ({
  get: () => storeState
}))
vi.mock('../terminalActions', () => ({ createTerminal: vi.fn() }))
vi.mock('../toasts', () => ({ notify: (...a: unknown[]) => notify(...a) }))

type Registry = typeof RegistryModule

const SAVE: CommandId = 'editor.save'
const SAVE_ALL: CommandId = 'workbench.saveAll'
const CLOSE_OTHERS: CommandId = 'workbench.closeOtherTabs'
let reg: Registry

// Each test loads a fresh module: the registry and the recents are module state.
async function load(): Promise<Registry> {
  vi.resetModules()
  return import('./registry')
}

const cmd = (id: CommandId, extra: Partial<RegistryModule.Command> = {}): RegistryModule.Command => ({
  id,
  title: id,
  category: 'Test',
  run: () => {},
  ...extra
})

beforeEach(async () => {
  notify.mockReset()
  storeState.keybindings = null
  localStorage.clear()
  reg = await load()
})

describe('command registry', () => {
  it('lists registered commands and removes them on dispose', () => {
    const dispose = reg.registerCommand(cmd(SAVE))
    expect(reg.listCommands().map((c) => c.id)).toEqual([SAVE])
    dispose()
    expect(reg.listCommands()).toEqual([])
  })

  it('disposing an old registration does not remove the command that replaced it', () => {
    const dispose = reg.registerCommand(cmd(SAVE, { title: 'old' }))
    reg.registerCommand(cmd(SAVE, { title: 'new' }))
    dispose()
    expect(reg.listCommands().map((c) => c.title)).toEqual(['new'])
  })

  it('hides commands with a false when and lists them again when it becomes true', () => {
    let on = false
    reg.registerCommand(cmd(SAVE, { when: () => on }))
    expect(reg.listCommands()).toEqual([])
    on = true
    expect(reg.listCommands()).toHaveLength(1)
  })

  it('does not execute a command with a false when and notifies', async () => {
    const run = vi.fn()
    reg.registerCommand(cmd(SAVE, { when: () => false, run }))
    await reg.executeCommand(SAVE)
    expect(run).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledTimes(1)
    expect(reg.recentCommandIds()).toEqual([])
  })

  it('forwards the arguments to run', async () => {
    const run = vi.fn()
    reg.registerCommand(cmd(SAVE, { run }))
    await reg.executeCommand(SAVE, 1, 'two', { three: 3 })
    expect(run).toHaveBeenCalledWith(1, 'two', { three: 3 })
  })

  it('notifies when the id is not registered', async () => {
    await reg.executeCommand('update.check')
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('update.check'))
  })

  it('notifies with the message when run throws', async () => {
    reg.registerCommand(
      cmd(SAVE, {
        run: () => {
          throw new Error('broke')
        }
      })
    )
    await reg.executeCommand(SAVE)
    expect(notify).toHaveBeenCalledWith('broke')
  })

  it('notifies with the message when run rejects', async () => {
    reg.registerCommand(cmd(SAVE, { run: () => Promise.reject(new Error('failed async')) }))
    await reg.executeCommand(SAVE)
    expect(notify).toHaveBeenCalledWith('failed async')
  })

  it('awaits an async run before resolving', async () => {
    let done = false
    reg.registerCommand(
      cmd(SAVE, {
        run: async () => {
          await new Promise((r) => setTimeout(r, 10))
          done = true
        }
      })
    )
    await reg.executeCommand(SAVE)
    expect(done).toBe(true)
  })
})

describe('recent commands', () => {
  it('keeps the most recent first, without duplicates', async () => {
    for (const id of [SAVE, SAVE_ALL, CLOSE_OTHERS]) reg.registerCommand(cmd(id))
    await reg.executeCommand(SAVE)
    await reg.executeCommand(SAVE_ALL)
    await reg.executeCommand(CLOSE_OTHERS)
    await reg.executeCommand(SAVE)
    expect(reg.recentCommandIds()).toEqual([SAVE, CLOSE_OTHERS, SAVE_ALL])
  })

  it('limits to 10 ids', async () => {
    const twelve = COMMAND_IDS.slice(0, 12)
    for (const id of twelve) reg.registerCommand(cmd(id))
    for (const id of twelve) await reg.executeCommand(id)
    const ids = reg.recentCommandIds()
    expect(ids).toHaveLength(10)
    expect(ids[0]).toBe(twelve[11])
    expect(ids).not.toContain(twelve[0])
    expect(ids).not.toContain(twelve[1])
  })

  it('persists in localStorage and restores when the module reloads', async () => {
    reg.registerCommand(cmd(SAVE))
    await reg.executeCommand(SAVE)
    const again = await load()
    expect(again.recentCommandIds()).toEqual([SAVE])
  })

  it('ignores garbage in localStorage', async () => {
    localStorage.setItem('walph.recentCommands', '{not json')
    expect((await load()).recentCommandIds()).toEqual([])
    localStorage.setItem('walph.recentCommands', JSON.stringify({ a: 1 }))
    expect((await load()).recentCommandIds()).toEqual([])
    localStorage.setItem('walph.recentCommands', JSON.stringify(['a', 1, null, 'b']))
    expect((await load()).recentCommandIds()).toEqual(['a', 'b'])
  })

  it('keeps working in the session when localStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    const run = vi.fn()
    reg.registerCommand(cmd(SAVE, { run }))
    await reg.executeCommand(SAVE)
    expect(run).toHaveBeenCalled()
    expect(reg.recentCommandIds()).toEqual([SAVE])
    expect(notify).not.toHaveBeenCalled()
  })

  it('loads empty when reading localStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect((await load()).recentCommandIds()).toEqual([])
  })
})

describe('effective shortcut', () => {
  it('before the first snapshot the command default applies', () => {
    expect(reg.keybindingOf(cmd(SAVE, { keybinding: 'CmdOrCtrl+S' }))).toBe('CmdOrCtrl+S')
  })

  it('after the snapshot the map applies: overridden, removed or no shortcut', () => {
    storeState.keybindings = { [SAVE]: ['CmdOrCtrl+Shift+S', 'CmdOrCtrl+Alt+S'] }
    expect(reg.keybindingOf(cmd(SAVE, { keybinding: 'CmdOrCtrl+S' }))).toBe('CmdOrCtrl+Shift+S')
    // Missing from the map = the user removed the shortcut (or never had one).
    expect(reg.keybindingOf(cmd(SAVE_ALL, { keybinding: 'CmdOrCtrl+B' }))).toBeUndefined()
  })

  it('going back to null restores the default', () => {
    storeState.keybindings = {}
    storeState.keybindings = null
    expect(reg.keybindingOf(cmd(SAVE, { keybinding: 'F2' }))).toBe('F2')
  })
})

describe('overlay policy', () => {
  it('evaluates by priority, not by registration order', async () => {
    const calls: string[] = []
    const policy = (name: string, priority: number): RegistryModule.OverlayPolicy => ({
      priority,
      active: () => true,
      close: () => calls.push(name),
      consumes: () => false
    })
    reg.registerOverlayPolicy(policy('after', 90))
    reg.registerOverlayPolicy(policy('before', 5))
    reg.registerCommand(cmd('view.toggleSidebar'))
    await reg.executeCommand('view.toggleSidebar')
    expect(calls).toEqual(['before', 'after'])
  })

  it('the policy that consumes the command stops the following ones and the command does not run', async () => {
    const run = vi.fn()
    const calls: string[] = []
    const policy = (name: string, priority: number, consumes: boolean): RegistryModule.OverlayPolicy => ({
      priority,
      active: () => true,
      close: () => calls.push(name),
      consumes: () => consumes
    })
    reg.registerOverlayPolicy(policy('first', 1, true))
    reg.registerOverlayPolicy(policy('second', 2, false))
    reg.registerCommand(cmd('workbench.closeTab', { run }))
    await reg.executeCommand('workbench.closeTab')
    expect(calls).toEqual(['first'])
    expect(run).not.toHaveBeenCalled()
  })

  it('keeps preserves the policy and global commands close none', async () => {
    const close = vi.fn()
    reg.registerOverlayPolicy({
      priority: 1,
      active: () => true,
      keeps: (id) => id === 'view.toggleSidebar',
      close,
      consumes: () => false
    })
    for (const id of ['view.toggleSidebar', 'view.zoomIn'] as const) {
      reg.registerCommand(cmd(id))
      await reg.executeCommand(id)
    }
    expect(close).not.toHaveBeenCalled()
  })

  it('disposing removes the policy', async () => {
    const close = vi.fn()
    const off = reg.registerOverlayPolicy({ priority: 1, active: () => true, close, consumes: () => true })
    reg.registerCommand(cmd('view.toggleSidebar'))
    off()
    await reg.executeCommand('view.toggleSidebar')
    expect(close).not.toHaveBeenCalled()
  })
})
