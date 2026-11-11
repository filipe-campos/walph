// Design system icon at runtime. The installer already uses the ones in `build/` (electron-builder); this covers what
// the package does not: the Dock in `pnpm dev` (otherwise it is the Electron icon), the window on Linux and
// notifications.
import { app, nativeImage } from 'electron'
import iconPath from '../../../build/icon.png?asset'
import macIconPath from '../../../build/icon-mac.png?asset'

/** Square icon (Windows/Linux) for `BrowserWindow` and `Notification`; on macOS the bundle's icon stays. */
export const windowIcon = process.platform === 'darwin' ? undefined : iconPath

/** macOS outside the package: the Dock would show the Electron icon. */
export function applyDevDockIcon(): void {
  if (process.platform !== 'darwin' || app.isPackaged) return
  app.dock?.setIcon(nativeImage.createFromPath(macIconPath))
}
