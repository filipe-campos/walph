import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommandId } from '@shared/commands'
import { installFakeApi } from './test/fakeApi'

installFakeApi()

const focusEditor = vi.hoisted(() => vi.fn())
vi.mock('./components/editor/editorFocus', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  focusEditor
}))

const { useStore } = await import('./store')
const { executeCommand, registerCommand } = await import('./commands/registry')
const { startSettingsReactions } = await import('./settingsActions')
const { startOverlayReactions } = await import('./overlayActions')
const { startDockerReactions } = await import('./dockerActions')

let stops: Array<() => void> = []
let disposers: Array<() => void> = []

const overlay = (): string | null => useStore.getState().overlay?.kind ?? null
const screen = (): string => useStore.getState().screen

function command(id: CommandId): ReturnType<typeof vi.fn> {
  const run = vi.fn()
  disposers.push(registerCommand({ id, title: id, category: 'Test', run }))
  return run
}

beforeEach(() => {
  focusEditor.mockClear()
  useStore.setState({ overlay: null, screen: 'workbench', quickInput: null })
  stops = [startSettingsReactions(), startOverlayReactions(), startDockerReactions()]
})

afterEach(() => {
  for (const stop of stops) stop()
  for (const dispose of disposers) dispose()
  disposers = []
  useStore.setState({ overlay: null, screen: 'workbench' })
})

const MODALS = [
  { name: 'settings', open: { kind: 'settings' }, consumed: ['workbench.closeTab'] },
  { name: 'mcp', open: { kind: 'mcp', conversationId: 'c1' }, consumed: ['workbench.closeTab', 'claude.closeSession'] },
  {
    name: 'usage',
    open: { kind: 'usage', conversationId: 'c1' },
    consumed: ['workbench.closeTab', 'claude.closeSession']
  },
  { name: 'addWorkspace', open: { kind: 'addWorkspace' }, consumed: ['workbench.closeTab', 'workspace.add'] }
] as const

describe.each(MODALS)('overlay policy $name', ({ open, consumed, name }) => {
  it.each(consumed)('%s closes the overlay and does not run the command', async (id) => {
    const run = command(id)
    useStore.setState({ overlay: open })
    await executeCommand(id)
    expect(overlay()).toBeNull()
    expect(run).not.toHaveBeenCalled()
  })

  it('a workbench command closes the overlay and runs', async () => {
    const run = command('view.toggleSidebar')
    useStore.setState({ overlay: open })
    await executeCommand('view.toggleSidebar')
    expect(overlay()).toBeNull()
    expect(run).toHaveBeenCalledOnce()
  })

  it('global commands run without closing the overlay', async () => {
    const run = command('view.zoomIn')
    useStore.setState({ overlay: open })
    await executeCommand('view.zoomIn')
    expect(overlay()).toBe(name)
    expect(run).toHaveBeenCalledOnce()
  })

  it('without the overlay open nothing changes', async () => {
    const run = command('workbench.closeTab')
    await executeCommand('workbench.closeTab')
    expect(run).toHaveBeenCalledOnce()
  })
})

describe('Containers screen policy', () => {
  it('⌘W leaves the screen and does not run the command', async () => {
    const run = command('workbench.closeTab')
    useStore.setState({ screen: 'containers' })
    await executeCommand('workbench.closeTab')
    expect(screen()).toBe('workbench')
    expect(run).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(focusEditor).toHaveBeenCalledOnce())
  })

  it('a workbench command goes back to the layout and runs', async () => {
    const run = command('view.toggleSidebar')
    useStore.setState({ screen: 'containers' })
    await executeCommand('view.toggleSidebar')
    expect(screen()).toBe('workbench')
    expect(run).toHaveBeenCalledOnce()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(focusEditor).not.toHaveBeenCalled()
  })

  it('globals, palettes, workspaces and view.containers keep the screen', async () => {
    useStore.setState({ screen: 'containers' })
    for (const id of ['view.zoomIn', 'workbench.quickOpen', 'workspace.add', 'view.containers'] as const) {
      command(id)
      await executeCommand(id)
      expect(screen()).toBe('containers')
    }
  })
})

describe('policy combination', () => {
  it('the one that consumes the command stops the following ones', async () => {
    const run = command('workbench.closeTab')
    useStore.setState({ overlay: { kind: 'settings' }, screen: 'containers' })
    await executeCommand('workbench.closeTab')
    expect(overlay()).toBeNull()
    expect(screen()).toBe('containers')
    expect(run).not.toHaveBeenCalled()
  })

  it('without consuming, the overlay closes and the Containers screen also yields', async () => {
    const run = command('view.toggleSidebar')
    useStore.setState({ overlay: { kind: 'settings' }, screen: 'containers' })
    await executeCommand('view.toggleSidebar')
    expect(overlay()).toBeNull()
    expect(screen()).toBe('workbench')
    expect(run).toHaveBeenCalledOnce()
  })
})

describe('registration lifecycle', () => {
  it('stopping the reactions removes the policies', async () => {
    for (const stop of stops) stop()
    stops = []
    const run = command('workbench.closeTab')
    useStore.setState({ overlay: { kind: 'settings' }, screen: 'containers' })
    await executeCommand('workbench.closeTab')
    expect(overlay()).toBe('settings')
    expect(screen()).toBe('containers')
    expect(run).toHaveBeenCalledOnce()
  })

  it('starting again after stopping registers only once', async () => {
    const stop = startSettingsReactions()
    stop()
    stops.push(startSettingsReactions())
    const run = command('view.toggleSidebar')
    useStore.setState({ overlay: { kind: 'settings' } })
    await executeCommand('view.toggleSidebar')
    expect(overlay()).toBeNull()
    expect(run).toHaveBeenCalledOnce()
  })
})
