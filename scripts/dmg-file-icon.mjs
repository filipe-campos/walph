import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// Custom Finder icon of the .dmg FILE. Only writes xattr/resource fork: the content does not change, so the
// sha512/blockmap in latest-mac.yml stay valid. The icon is lost when the file is uploaded/downloaded over HTTP.
const JXA = `ObjC.import('AppKit')
function run(argv) {
  const img = $.NSImage.alloc.initWithContentsOfFile(argv[0])
  if (!img || img.isNil()) throw new Error('invalid image')
  if (!$.NSWorkspace.sharedWorkspace.setIconForFileOptions(img, argv[1], 0)) throw new Error('setIcon failed')
}`

export default function afterAllArtifactBuild(result) {
  if (process.platform !== 'darwin') return []
  const icns = join(result?.outDir ?? join(process.cwd(), 'dist'), '.icon-icns', 'icon.icns')
  const icon = existsSync(icns) ? icns : join(process.cwd(), 'build', 'icon-mac.png')
  for (const file of result?.artifactPaths ?? []) {
    if (!file.endsWith('.dmg')) continue
    try {
      execFileSync('osascript', ['-l', 'JavaScript', '-e', JXA, icon, file], { stdio: 'pipe', timeout: 30_000 })
    } catch (err) {
      console.warn(`  • warning: could not apply the icon to ${file}: ${err.message}`)
    }
  }
  return []
}
