import { bindView } from '../settings/binding'
import { setValue, resetValue, openFile, setWorkspace, startSettings } from '../settings/service'
import { onWindowRootChange } from '../window/windows'
import { handle } from './typed'

export function registerSettingsHandlers(): void {
  startSettings()
  onWindowRootChange((wc, root) => void bindView(wc, root))
  handle('settings:setWorkspace', (e, root: unknown) => setWorkspace(e.sender, root))
  handle('settings:openFile', (e, kind: unknown) => openFile(e.sender, kind))
  handle('settings:setValue', (e, layer: unknown, key: unknown, value: unknown) =>
    setValue(e.sender, layer, key, value)
  )
  handle('settings:resetValue', (e, layer: unknown, key: unknown) => resetValue(e.sender, layer, key))
}
