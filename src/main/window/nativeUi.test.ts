import { beforeEach, describe, expect, it, vi } from 'vitest'

const dialog = vi.hoisted(() => ({
  showMessageBox: vi.fn(),
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn()
}))
const win = vi.hoisted(() => ({ id: 'window' }))
const hasWindow = vi.hoisted(() => ({ value: true }))

vi.mock('electron', () => ({ dialog, Menu: {} }))
vi.mock('./windows', () => ({ windowOf: () => (hasWindow.value ? win : null) }))

const { confirmDestructive, pickFolder, showMessageBoxFor, showOpenDialogFor, showSaveDialogFor } =
  await import('./nativeUi')

const wc = {} as never

beforeEach(() => {
  vi.resetAllMocks()
  hasWindow.value = true
})

describe('parent window', () => {
  it('uses the view window as parent', async () => {
    dialog.showMessageBox.mockResolvedValue({ response: 2 })
    expect(await showMessageBoxFor(wc, { message: 'x' })).toBe(2)
    expect(dialog.showMessageBox).toHaveBeenCalledWith(win, { message: 'x' })
  })

  it('null wc shows the dialog without a parent window', async () => {
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/a'] })
    expect(await showOpenDialogFor(null, { title: 't' })).toEqual(['/a'])
    expect(dialog.showOpenDialog).toHaveBeenCalledWith({ title: 't' })
  })

  it('view without a window: no dialog is shown and the result is cancelled', async () => {
    hasWindow.value = false
    expect(await showMessageBoxFor(wc, { message: 'x' })).toBeNull()
    expect(await showOpenDialogFor(wc, {})).toBeNull()
    expect(await showSaveDialogFor(wc, {})).toBeNull()
    expect(await pickFolder(wc)).toBeNull()
    expect(await confirmDestructive(wc, { message: 'x', confirmLabel: 'Ok' })).toBe(false)
    expect(dialog.showMessageBox).not.toHaveBeenCalled()
    expect(dialog.showOpenDialog).not.toHaveBeenCalled()
    expect(dialog.showSaveDialog).not.toHaveBeenCalled()
  })
})

describe('results', () => {
  it('open and save return null on cancel', async () => {
    dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    dialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath: '' })
    expect(await showOpenDialogFor(wc, {})).toBeNull()
    expect(await showSaveDialogFor(wc, {})).toBeNull()
  })

  it('save returns the path; pickFolder the first of the list', async () => {
    dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/x.md' })
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/p', '/q'] })
    expect(await showSaveDialogFor(wc, {})).toBe('/x.md')
    expect(await pickFolder(wc)).toBe('/p')
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(win, { properties: ['openDirectory', 'createDirectory'] })
  })
})

describe('confirmDestructive', () => {
  it('Cancel is the default (Enter and Esc) and only the first button confirms', async () => {
    dialog.showMessageBox.mockResolvedValue({ response: 0 })
    expect(await confirmDestructive(wc, { message: 'm', confirmLabel: 'Apagar' })).toBe(true)
    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      win,
      expect.objectContaining({ type: 'warning', buttons: ['Apagar', 'Cancelar'], defaultId: 1, cancelId: 1 })
    )
    dialog.showMessageBox.mockResolvedValue({ response: 1 })
    expect(await confirmDestructive(wc, { message: 'm', confirmLabel: 'Apagar', type: 'question' })).toBe(false)
  })

  it('accepts the caller cancel label', async () => {
    dialog.showMessageBox.mockResolvedValue({ response: 1 })
    await confirmDestructive(wc, { message: 'm', confirmLabel: 'Force', cancelLabel: 'Wait' })
    expect(dialog.showMessageBox).toHaveBeenCalledWith(win, expect.objectContaining({ buttons: ['Force', 'Wait'] }))
  })
})
