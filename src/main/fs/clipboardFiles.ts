// Files on the native clipboard (copied in Finder/Explorer). Clipboard content is not trusted: here it only becomes
// a list of absolute paths; the consumer still checks they exist.

import { fileURLToPath } from 'node:url'
import { posix, win32 } from 'node:path'

const MAX_PATHS = 1000

const XML_ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" }
const unescapeXml = (v: string): string => v.replace(/&(?:amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m] ?? m)
const escapeXml = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function clean(paths: string[], platform: NodeJS.Platform): string[] {
  const { isAbsolute } = platform === 'win32' ? win32 : posix
  return paths.filter((p) => p !== '' && !p.includes('\0') && isAbsolute(p)).slice(0, MAX_PATHS)
}

/** `NSFilenamesPboardType` (macOS): XML plist with an array of `<string>` with the paths. */
export function parseFilenamesPlist(xml: string, platform: NodeJS.Platform = process.platform): string[] {
  const array = /<array>([\s\S]*?)<\/array>/.exec(xml)?.[1] ?? ''
  return clean(
    [...array.matchAll(/<string>([\s\S]*?)<\/string>/g)].map((m) => unescapeXml(m[1] ?? '')),
    platform
  )
}

/** Plist accepted by Finder on paste. */
export function buildFilenamesPlist(paths: string[]): string {
  const items = paths.map((p) => `<string>${escapeXml(p)}</string>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><array>${items}</array></plist>`
}

/** `text/uri-list` and `public.file-url`: one `file://` URL per line (`#` = comment). Other URLs are ignored. */
export function parseFileUrlList(text: string, platform: NodeJS.Platform = process.platform): string[] {
  const paths: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const url = line.trim()
    if (!url.startsWith('file:')) continue
    try {
      paths.push(fileURLToPath(url, { windows: platform === 'win32' }))
    } catch {
      // URL invalid for this OS: ignored.
    }
  }
  return clean(paths, platform)
}
