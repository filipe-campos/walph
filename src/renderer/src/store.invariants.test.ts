import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeApi } from './test/fakeApi'

installFakeApi()

const { useStore } = await import('./store')
const { openQuickInput, openUnifiedPalette, showPicker, closeQuickInput } = await import('./quickInputActions')
const { hidePanel, togglePanelView, removeTerminal, togglePanelMaximized } = await import('./terminalActions')
const { openSettingsModal } = await import('./settingsActions')
const { openAddWorkspace, openMcpModal, openUsageModal } = await import('./overlayActions')

beforeEach(() => {
  vi.restoreAllMocks()
  useStore.setState({
    quickInput: null,
    overlay: null,
    themePreview: null,
    terminalVisible: true,
    panelMaximized: true,
    panelView: 'terminal',
    screen: 'workbench',
    terminals: [{ id: 't1', groupId: 't1', title: 't', profile: 'p' }] as never,
    activeTerminalId: 't1'
  })
})

describe('quick input', () => {
  it.each([
    ['openQuickInput', () => openQuickInput('>')],
    ['openUnifiedPalette', openUnifiedPalette],
    ['showPicker', () => showPicker('recent')]
  ])('%s closes the open modal in the same set', (_, open) => {
    useStore.setState({ overlay: { kind: 'settings' } })
    open()
    expect(useStore.getState().overlay).toBeNull()
    expect(useStore.getState().quickInput).not.toBeNull()
  })

  it('closing the theme picker discards the preview', () => {
    showPicker('theme')
    useStore.setState({ themePreview: 'other' })
    closeQuickInput()
    expect(useStore.getState().themePreview).toBeNull()
  })

  it('switching the theme picker to another mode discards the preview', () => {
    showPicker('theme')
    useStore.setState({ themePreview: 'other' })
    openQuickInput('>')
    expect(useStore.getState().themePreview).toBeNull()
  })
})

describe('modals', () => {
  it.each([
    ['openSettingsModal', openSettingsModal],
    ['openAddWorkspace', openAddWorkspace],
    ['openMcpModal', () => openMcpModal('c1')],
    ['openUsageModal', () => openUsageModal('c1')]
  ])('%s closes the theme picker and discards the preview', (_, open) => {
    showPicker('theme')
    useStore.setState({ themePreview: 'other' })
    open()
    expect(useStore.getState()).toMatchObject({ quickInput: null, themePreview: null })
    expect(useStore.getState().overlay).not.toBeNull()
  })
})

describe('maximized panel', () => {
  it('maximizing the closed panel without a terminal does not stay maximized if the terminal is not created', async () => {
    useStore.setState({ terminalVisible: false, panelMaximized: false, terminals: [], activeTerminalId: null })
    togglePanelMaximized()
    expect(useStore.getState().panelMaximized).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(useStore.getState()).toMatchObject({ terminalVisible: false, panelMaximized: false })
  })

  it('hidePanel unmaximizes', () => {
    hidePanel()
    expect(useStore.getState()).toMatchObject({ terminalVisible: false, panelMaximized: false })
  })

  it('togglePanelView that hides the panel unmaximizes', () => {
    togglePanelView('terminal')
    expect(useStore.getState()).toMatchObject({ terminalVisible: false, panelMaximized: false })
  })

  it('removing the last terminal unmaximizes', () => {
    removeTerminal('t1')
    expect(useStore.getState()).toMatchObject({ terminalVisible: false, panelMaximized: false })
  })

  it('removing a terminal with others open keeps the panel maximized', () => {
    useStore.setState({
      terminals: [
        { id: 't1', groupId: 't1', title: 't', profile: 'p' },
        { id: 't2', groupId: 't2', title: 't', profile: 'p' }
      ] as never
    })
    removeTerminal('t1')
    expect(useStore.getState().panelMaximized).toBe(true)
  })
})
