import type { LspApi, LspCodeAction } from '@shared/types'
import type { EditorView } from '@codemirror/view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Text } from '@codemirror/state'
import { setLocale } from '@shared/i18n'
import { deferred } from '../../test/deferred'
import { installFakeApi } from '../../test/fakeApi'
import { mountEditor, unmountEditors } from '../../test/editorHarness'
import type { LspHost } from './lspHost'
import { closeQuickFixMenu, lightbulbOn, lspCodeActions, openQuickFix } from './lspCodeActions'

const codeActions = vi.fn<LspApi['codeActions']>()

const fix = (title: string, extra: Partial<LspCodeAction> = {}): LspCodeAction => ({ title, ...extra })

beforeEach(() => {
  vi.useFakeTimers()
  installFakeApi({ lsp: { codeActions } })
  codeActions.mockResolvedValue([])
})

afterEach(() => {
  unmountEditors()
  vi.useRealTimers()
  setLocale('pt-BR')
})

function setup(doc = 'let x\nlet y', host: Partial<LspHost> = {}, path: string | null = '/r/a.ts', anchor = 0) {
  return mountEditor({ doc, extensions: [lspCodeActions('t1'), lightbulbOn], selection: { anchor }, host, path })
}

const flush = async (ms = 0): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms)
}
// The (hidden) gutter spacer reserves the width with a fake lightbulb.
const bulb = (view: EditorView): HTMLElement | null =>
  [...view.dom.querySelectorAll<HTMLElement>('.lsp-lightbulb')].find(
    (el) => el.parentElement!.style.visibility !== 'hidden'
  ) ?? null
const menu = (view: EditorView): HTMLElement | null => view.dom.querySelector('.lsp-menu')
const items = (view: EditorView): HTMLElement[] => [...view.dom.querySelectorAll<HTMLElement>('.lsp-menu-item')]
const selectedTitle = (view: EditorView): string =>
  view.dom.querySelector('.lsp-menu-item.selected .lsp-menu-label')!.textContent
const press = (view: EditorView, key: string): boolean =>
  !view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))

describe('code actions lightbulb', () => {
  it('after the wait it asks for the selection actions and shows the lightbulb on the cursor line', async () => {
    codeActions.mockResolvedValue([fix('Import')])
    const { view } = setup()
    await flush(299)
    expect(codeActions).not.toHaveBeenCalled()
    await flush(1)
    expect(codeActions).toHaveBeenCalledExactlyOnceWith('/r/a.ts', {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 }
    })
    expect(bulb(view)!.className).toContain('codicon-lightbulb')
    expect(bulb(view)!.className).not.toContain('autofix')
    expect(bulb(view)!.title).toBe('Mostrar ações de código (Ctrl+.)')
  })

  it('on macOS the hint shortcut is ⌘.', async () => {
    installFakeApi({ platform: 'darwin', lsp: { codeActions } })
    codeActions.mockResolvedValue([fix('Import')])
    const { view } = setup()
    await flush(300)
    expect(bulb(view)!.title).toBe('Mostrar ações de código (⌘.)')
  })

  it('a preferred quickfix switches the icon to the autofix one', async () => {
    codeActions.mockResolvedValue([fix('Fix', { isPreferred: true, kind: 'quickfix' })])
    const { view } = setup()
    await flush(300)
    expect(bulb(view)!.className).toContain('codicon-lightbulb-autofix')
  })

  it('a preferred action that is not a quickfix or is disabled does not become an autofix', async () => {
    codeActions.mockResolvedValue([
      fix('Extract', { isPreferred: true, kind: 'refactor.extract' }),
      fix('Off', { isPreferred: true, disabled: 'no' })
    ])
    const { view } = setup()
    await flush(300)
    expect(bulb(view)!.className).not.toContain('autofix')
  })

  it('without actions no lightbulb shows', async () => {
    const { view } = setup()
    await flush(300)
    expect(codeActions).toHaveBeenCalledTimes(1)
    expect(bulb(view)).toBeNull()
  })

  it('moving the cursor or editing removes the lightbulb until the next request', async () => {
    codeActions.mockResolvedValue([fix('Import')])
    const { view } = setup()
    await flush(300)
    expect(bulb(view)).not.toBeNull()
    codeActions.mockResolvedValue([])
    view.dispatch({ selection: { anchor: 2 } })
    expect(bulb(view)).toBeNull()
    await flush(300)
    expect(bulb(view)).toBeNull()
    expect(codeActions).toHaveBeenCalledTimes(2)
  })

  it('the lightbulb disappears when the cursor no longer has actions', async () => {
    codeActions.mockResolvedValueOnce([fix('Import')])
    const { view } = setup()
    await flush(300)
    view.dispatch({ selection: { anchor: 7 } })
    codeActions.mockResolvedValueOnce([])
    await flush(300)
    expect(bulb(view)).toBeNull()
  })

  it('several changes in a row become a single request', async () => {
    const { view } = setup()
    await flush(300)
    codeActions.mockClear()
    view.dispatch({ selection: { anchor: 1 } })
    await flush(200)
    view.dispatch({ selection: { anchor: 2 } })
    await flush(200)
    expect(codeActions).not.toHaveBeenCalled()
    await flush(100)
    expect(codeActions).toHaveBeenCalledTimes(1)
  })

  it('a response arriving after the cursor moved is discarded', async () => {
    const late = deferred<LspCodeAction[]>()
    codeActions.mockReturnValueOnce(late.promise)
    const { view } = setup()
    await flush(300)
    view.dispatch({ selection: { anchor: 3 } })
    late.resolve([fix('Old')])
    await flush(0)
    expect(bulb(view)).toBeNull()
  })

  it('a server error is silently ignored', async () => {
    codeActions.mockRejectedValue(new Error('x'))
    const { view, host } = setup()
    await flush(300)
    expect(bulb(view)).toBeNull()
    expect(host.notifyError).not.toHaveBeenCalled()
  })

  it('without a ready server or without a path it asks for nothing', async () => {
    for (const args of [
      [{ serverFor: () => null }, '/r/a.ts'],
      [{ serverFor: () => ({ id: 's', ready: false }) }, '/r/a.ts'],
      [{}, null]
    ] as const) {
      setup('a', args[0], args[1])
      await flush(300)
      unmountEditors()
    }
    expect(codeActions).not.toHaveBeenCalled()
  })

  it('clicking the lightbulb opens the menu without taking focus from the editor', async () => {
    codeActions.mockResolvedValue([fix('Import')])
    const { view } = setup()
    await flush(300)
    const marker = bulb(view)!.parentElement!
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    marker.dispatchEvent(event)
    await flush(0)
    expect(event.defaultPrevented).toBe(true)
    expect(items(view).map((i) => i.textContent)).toEqual(['Import'])
    expect(codeActions).toHaveBeenCalledTimes(1)
  })
})

describe('quick fix menu', () => {
  const actions = [
    fix('Second'),
    fix('Preferred', { isPreferred: true }),
    fix('Disabled', { disabled: 'no permission' })
  ]

  it('shows the sorted actions (preferred first, disabled last) with the first enabled one marked', async () => {
    codeActions.mockResolvedValue([actions[2], actions[0], actions[1]])
    const { view } = setup()
    await openQuickFix(view, 't1')
    expect(menu(view)!.getAttribute('role')).toBe('listbox')
    expect(menu(view)!.getAttribute('aria-label')).toBe('Ações de código')
    expect(items(view).map((i) => i.querySelector('.lsp-menu-label')!.textContent)).toEqual([
      'Preferred',
      'Second',
      'Disabled'
    ])
    expect(items(view).map((i) => i.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
    expect(items(view)[0].querySelector('.codicon-lightbulb-autofix')).not.toBeNull()
  })

  it('a disabled action shows the reason, is dimmed and cannot be picked', async () => {
    codeActions.mockResolvedValue(actions)
    const { view, host } = setup()
    await openQuickFix(view, 't1')
    const off = items(view)[2]
    expect(off.getAttribute('aria-disabled')).toBe('true')
    expect(off.title).toBe('no permission')
    expect(off.classList.contains('disabled')).toBe(true)
    expect(off.querySelector('.lsp-menu-reason')!.textContent).toBe('no permission')
    expect(off.getAttribute('aria-describedby')).toBe(off.querySelector('.lsp-menu-reason')!.id)
    off.click()
    expect(host.applyCodeAction).not.toHaveBeenCalled()
    expect(menu(view)).not.toBeNull()
  })

  it('arrows move the selection, skipping disabled ones and wrapping; Enter applies via the host', async () => {
    codeActions.mockResolvedValue(actions)
    const { view, host } = setup()
    const snapshot = new Map<string, Text>([['/r/a.ts', Text.of(['x'])]])
    host.snapshotDocs.mockReturnValue(snapshot)
    await openQuickFix(view, 't1')
    expect(press(view, 'ArrowDown')).toBe(true)
    expect(selectedTitle(view)).toBe('Second')
    press(view, 'ArrowDown')
    expect(selectedTitle(view)).toBe('Preferred')
    press(view, 'ArrowUp')
    expect(selectedTitle(view)).toBe('Second')
    press(view, 'ArrowUp')
    expect(selectedTitle(view)).toBe('Preferred')
    press(view, 'ArrowUp')
    expect(selectedTitle(view)).toBe('Second')

    press(view, 'Enter')
    expect(host.applyCodeAction).toHaveBeenCalledExactlyOnceWith(
      '/r/a.ts',
      expect.objectContaining({ title: 'Second' }),
      view.state.doc,
      snapshot
    )
    expect(menu(view)).toBeNull()
  })

  it('clicking an action applies and closes; mousedown on the item does not take focus from the editor', async () => {
    codeActions.mockResolvedValue(actions)
    const { view, host } = setup()
    await openQuickFix(view, 't1')
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    items(view)[1].dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
    items(view)[1].click()
    expect(host.applyCodeAction).toHaveBeenCalledWith(
      '/r/a.ts',
      expect.objectContaining({ title: 'Second' }),
      expect.anything(),
      expect.anything()
    )
    expect(menu(view)).toBeNull()
  })

  it('Esc closes the menu; without an open menu the keys go on to the editor', async () => {
    codeActions.mockResolvedValue(actions)
    const { view } = setup()
    expect(press(view, 'ArrowDown')).toBe(false)
    await openQuickFix(view, 't1')
    expect(press(view, 'Escape')).toBe(true)
    expect(menu(view)).toBeNull()
  })

  it('editing the text, moving the cursor or the close effect (hiding the tab) close the menu', async () => {
    codeActions.mockResolvedValue(actions)
    const { view } = setup()
    for (const close of [
      () => view.dispatch({ changes: { from: 0, insert: 'a' } }),
      () => view.dispatch({ selection: { anchor: 3 } }),
      () => view.dispatch({ effects: closeQuickFixMenu })
    ]) {
      await openQuickFix(view, 't1')
      expect(menu(view)).not.toBeNull()
      close()
      expect(menu(view)).toBeNull()
    }
  })

  it('reuses the lightbulb actions when the cursor is still where they were computed', async () => {
    codeActions.mockResolvedValue([fix('Import')])
    const { view } = setup()
    await flush(300)
    codeActions.mockClear()
    await openQuickFix(view, 't1')
    expect(codeActions).not.toHaveBeenCalled()
    expect(items(view)).toHaveLength(1)
  })
})

describe('openQuickFix: notices', () => {
  it('without an active server it notifies and asks for nothing', async () => {
    const { view, host } = setup('a', { serverFor: () => null })
    await openQuickFix(view, 't1')
    expect(host.notify).toHaveBeenCalledWith('Nenhum servidor de linguagem ativo para este arquivo.', 'info')
    expect(codeActions).not.toHaveBeenCalled()
  })

  it('a tab without a known path notifies the same', async () => {
    const { view, host } = setup('a', {}, null)
    await openQuickFix(view, 't1')
    expect(host.notify).toHaveBeenCalledWith('Nenhum servidor de linguagem ativo para este arquivo.', 'info')
  })

  it('an empty list notifies that there are no actions', async () => {
    const { view, host } = setup()
    await openQuickFix(view, 't1')
    expect(host.notify).toHaveBeenCalledWith('Nenhuma ação de código disponível aqui.', 'info')
    expect(menu(view)).toBeNull()
  })

  it('all disabled: notifies the reason of the first instead of opening a menu with no choice', async () => {
    codeActions.mockResolvedValue([fix('A', { disabled: 'reason A' }), fix('B', { disabled: 'reason B' })])
    const { view, host } = setup()
    await openQuickFix(view, 't1')
    expect(host.notify).toHaveBeenCalledWith('reason A', 'info')
    expect(menu(view)).toBeNull()
  })

  it('a server error goes to the host and does not open a menu', async () => {
    const err = new Error('boom')
    codeActions.mockRejectedValue(err)
    const { view, host } = setup()
    await openQuickFix(view, 't1')
    expect(host.notifyError).toHaveBeenCalledWith(err)
    expect(menu(view)).toBeNull()
  })

  it('cursor moved or text edited during the wait: the menu does not open', async () => {
    const late = deferred<LspCodeAction[]>()
    codeActions.mockReturnValue(late.promise)
    const { view, host } = setup()
    const pending = openQuickFix(view, 't1')
    view.dispatch({ selection: { anchor: 4 } })
    late.resolve([fix('Old')])
    await pending
    expect(menu(view)).toBeNull()
    expect(host.notify).not.toHaveBeenCalled()
  })

  it('the menu label and the notice follow the current language', async () => {
    setLocale('en')
    const { view, host } = setup('a', {}, '/r/a.ts')
    await openQuickFix(view, 't1')
    expect(host.notify).toHaveBeenCalledWith('No code actions available here.', 'info')
  })
})
