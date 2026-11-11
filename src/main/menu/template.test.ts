import { describe, expect, it, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'
import { COMMAND_IDS, isCommandAvailable, type CommandId } from '@shared/commands'
import { defaultBindings, type Bindings } from '../keybindings/userKeybindings'
import { buildTemplate, menuCommandIds, type MenuTemplateInput } from './template'

const PLATFORMS = ['darwin', 'win32', 'linux'] as const

function input(platform: string, overrides: Partial<MenuTemplateInput> = {}): MenuTemplateInput {
  const defaults = defaultBindings(platform)
  return {
    platform,
    isPackaged: true,
    appName: 'Walph',
    home: platform === 'win32' ? 'C:\\Users\\f' : '/Users/f',
    bindings: defaults,
    defaults,
    recent: [],
    actions: { sendCommand: vi.fn(), openRecent: vi.fn(), quit: vi.fn(), reloadActiveView: vi.fn() },
    ...overrides
  }
}

function flatten(items: readonly MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return items.flatMap((item) => [item, ...(Array.isArray(item.submenu) ? flatten(item.submenu) : [])])
}

const topLevel = (template: MenuItemConstructorOptions[], label: string): MenuItemConstructorOptions[] =>
  flatten([template.find((m) => m.label === label)!])

describe('buildTemplate', () => {
  describe.each(PLATFORMS)('%s', (platform) => {
    it.each([true, false])('every menu command is available on the platform (packaged=%s)', (isPackaged) => {
      const { ids } = buildTemplate(input(platform, { isPackaged }))
      for (const id of ids) expect(isCommandAvailable(id, platform, isPackaged), id).toBe(true)
    })

    it('the collected ids are the known commands', () => {
      const { ids } = buildTemplate(input(platform))
      for (const id of ids) expect(COMMAND_IDS).toContain(id)
      expect(menuCommandIds(platform, true)).toEqual(ids)
    })

    it('does not register the native Ctrl+W outside macOS', () => {
      if (platform === 'darwin') return
      const { template } = buildTemplate(input(platform))
      const nativeClose = flatten(template).filter((i) => i.role === 'close' || i.role === 'windowMenu')
      expect(nativeClose).toEqual([])
      const windowMenu = template.find((m) => m.label === 'Janela')
      expect(windowMenu?.submenu).toEqual([
        expect.objectContaining({ role: 'minimize' }),
        expect.objectContaining({ role: 'zoom' })
      ])
    })

    it('roles become plain items again when the shortcut was changed', () => {
      const rebound: Bindings = { ...defaultBindings(platform), 'workbench.quit': [{ key: 'Ctrl+Alt+Q' }] }
      const { template } = buildTemplate(input(platform, { bindings: rebound }))
      const quit = flatten(template).find((i) => i.accelerator === 'Ctrl+Alt+Q')
      expect(quit?.role).toBeUndefined()
      expect(quit?.click).toBeTypeOf('function')
    })

    it('keeps the quit role while the shortcut is the default', () => {
      const { template } = buildTemplate(input(platform))
      expect(flatten(template).some((i) => i.role === 'quit')).toBe(true)
    })

    it('a removed shortcut leaves neither accelerator nor native role', () => {
      if (!defaultBindings(platform)['workbench.quit']?.length) return
      const none: Bindings = { ...defaultBindings(platform), 'workbench.quit': [] }
      const { template } = buildTemplate(input(platform, { bindings: none }))
      expect(flatten(template).some((i) => i.role === 'quit')).toBe(false)
    })

    it('a plain item sends the command through the actions', () => {
      const sendCommand = vi.fn()
      const base = input(platform)
      const { template } = buildTemplate({ ...base, actions: { ...base.actions, sendCommand } })
      const save = flatten(template).find((i) => i.label === 'Salvar')
      ;(save?.click as () => void)()
      expect(sendCommand).toHaveBeenCalledWith('editor.save' satisfies CommandId)
    })
  })

  it('only macOS has the app menu and Close Window', () => {
    expect(buildTemplate(input('darwin')).ids.has('workbench.closeWindow')).toBe(true)
    expect(buildTemplate(input('win32')).ids.has('workbench.closeWindow')).toBe(false)
    expect(buildTemplate(input('darwin')).template[0].label).toBe('Walph')
    expect(buildTemplate(input('linux')).template[0].label).not.toBe('Walph')
  })

  it('reload and DevTools only exist outside the packaged app', () => {
    expect(buildTemplate(input('linux', { isPackaged: true })).ids.has('workbench.reload')).toBe(false)
    const reloadActiveView = vi.fn()
    const base = input('linux', { isPackaged: false })
    const { template, ids } = buildTemplate({ ...base, actions: { ...base.actions, reloadActiveView } })
    expect(ids.has('workbench.reload')).toBe(true)
    const reload = flatten(template).find((i) => i.label?.startsWith('Recarregar'))
    ;(reload?.click as () => void)?.()
    expect(reloadActiveView).toHaveBeenCalled()
  })

  it('a chord or when shortcut becomes a hint in the label, with no accelerator', () => {
    const bindings: Bindings = {
      ...defaultBindings('linux'),
      'workbench.saveAll': [{ key: 'Ctrl+K S' }],
      'editor.splitRight': [{ key: 'Ctrl+\\', when: 'editorFocus' }]
    }
    const { template } = buildTemplate(input('linux', { bindings }))
    const all = flatten(template)
    const saveAll = all.find((i) => i.label?.startsWith('Salvar Todos'))
    expect(saveAll?.accelerator).toBeUndefined()
    expect(saveAll?.label).toMatch(/\tCtrl\+K S$/)
    const split = all.find((i) => i.label?.startsWith('Dividir Editor'))
    expect(split?.accelerator).toBeUndefined()
  })

  describe('recent folders', () => {
    const recentItems = (platform: string, recent: string[]): MenuItemConstructorOptions[] => {
      const { template } = buildTemplate(input(platform, { recent }))
      const file = topLevel(template, 'Arquivo')
      return flatten(file.find((i) => i.label === 'Abrir Recente')?.submenu as MenuItemConstructorOptions[])
    }

    it('with no recents shows the disabled item and disables clear', () => {
      const items = recentItems('linux', [])
      expect(items[0].enabled).toBe(false)
      expect(items.filter((i) => i.enabled === false).length).toBe(3)
    })

    it('shortens home to ~ and escapes &', () => {
      const items = recentItems('linux', ['/Users/f', '/Users/f/dev/a&b', '/opt/x'])
      expect(items.slice(0, 3).map((i) => i.label)).toEqual(['~', '~/dev/a&&b', '/opt/x'])
    })

    it('does not mistake a sibling of home for a folder inside it', () => {
      expect(recentItems('linux', ['/Users/fx/a'])[0].label).toBe('/Users/fx/a')
    })

    it('on Linux case matters: /Users/F is not the home /Users/f', () => {
      expect(recentItems('linux', ['/Users/F/x'])[0].label).toBe('/Users/F/x')
    })

    it('on Windows ignores the drive letter case (c: vs C:)', () => {
      const items = recentItems('win32', ['c:\\users\\f\\Proj', 'C:\\Users\\F'])
      expect(items.slice(0, 2).map((i) => i.label)).toEqual(['~\\Proj', '~'])
    })

    it('shows only the first 10 and clicking opens the folder', () => {
      const openRecent = vi.fn()
      const base = input('linux', { recent: Array.from({ length: 15 }, (_, i) => `/p/${i}`) })
      const { template } = buildTemplate({ ...base, actions: { ...base.actions, openRecent } })
      const sub = topLevel(template, 'Arquivo').find((i) => i.label === 'Abrir Recente')
        ?.submenu as MenuItemConstructorOptions[]
      const folders = sub.filter((i) => i.label?.startsWith('/p/'))
      expect(folders).toHaveLength(10)
      ;(folders[3].click as () => void)()
      expect(openRecent).toHaveBeenCalledWith('/p/3')
    })
  })
})
