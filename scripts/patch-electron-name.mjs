// In `pnpm dev` macOS reads the app name (bold menu, Dock tooltip) from the Info.plist of the Electron.app in
// node_modules, which says "Electron". Replaces it with "Walph". Idempotent; does nothing outside macOS.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const NAME = 'Walph'
const PLIST_BUDDY = '/usr/libexec/PlistBuddy'

function main() {
  if (process.platform !== 'darwin' || !existsSync(PLIST_BUDDY)) return
  let pkgPath
  try {
    pkgPath = createRequire(import.meta.url).resolve('electron/package.json')
  } catch {
    return // electron not installed yet
  }
  const app = join(dirname(pkgPath), 'dist', 'Electron.app')
  const plist = join(app, 'Contents', 'Info.plist')
  if (!existsSync(plist)) return
  for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
    try {
      execFileSync(PLIST_BUDDY, ['-c', `Set :${key} ${NAME}`, plist], { stdio: 'ignore' })
    } catch {
      // Missing key: create it instead of failing
      execFileSync(PLIST_BUDDY, ['-c', `Add :${key} string ${NAME}`, plist], { stdio: 'ignore' })
    }
  }
  // Editing the Info.plist invalidates the bundle signature; re-sign ad hoc so notifications/TCC keep working in dev.
  execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'ignore' })
  // LaunchServices caches the name; touching the bundle date forces a reread.
  execFileSync('touch', [app], { stdio: 'ignore' })
}

try {
  main()
} catch (err) {
  // Cosmetic: never breaks the install
  console.warn(`patch-electron-name: ${err instanceof Error ? err.message : err}`)
}
