// Custom `app://walph/` scheme to serve the packaged renderer. Reason: `file://` pages do not get the V8 code cache
// (the bundle is reparsed for every view/workspace); a privileged scheme with `codeCache` does. In dev the renderer
// comes from the Vite server and this module is not used.

import { app, protocol } from 'electron'
import { readFile } from 'node:fs/promises'
import { extname, join, relative, resolve, sep } from 'node:path'

const APP_SCHEME = 'app'
const APP_HOST = 'walph'
export const APP_INDEX_URL = `${APP_SCHEME}://${APP_HOST}/index.html`

// Must run before `app.ready`.
protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } }
])

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm'
}

/**
 * Disk path of an `app://walph/...` URL inside `root`, or `null` (wrong host, `..`, null byte, outside the folder).
 * Pure so it can be tested.
 */
export function resolveAppRequest(rawUrl: string, root: string): string | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  if (url.protocol !== `${APP_SCHEME}:` || url.hostname !== APP_HOST) return null
  let pathname: string
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return null
  }
  if (pathname.includes('\0') || pathname.includes('\\')) return null
  const base = resolve(root)
  const target = resolve(base, `.${pathname === '/' ? '/index.html' : pathname}`)
  const rel = relative(base, target)
  if (!rel || rel.startsWith('..') || rel.split(sep).includes('..') || resolve(base, rel) !== target) return null
  return target
}

export function mimeOf(file: string): string {
  return MIME[extname(file).toLowerCase()] ?? 'application/octet-stream'
}

/** Registers the handler (after `ready`). Serves only the packaged renderer folder. */
export function registerAppProtocol(): void {
  const root = join(__dirname, '../renderer')
  protocol.handle(APP_SCHEME, async (request) => {
    const file = resolveAppRequest(request.url, root)
    if (!file) return new Response('Not found', { status: 404 })
    try {
      const body = await readFile(file)
      return new Response(new Uint8Array(body), { headers: { 'content-type': mimeOf(file) } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

/** The packaged renderer is loaded from this scheme; in dev (Vite server) it is not. */
export function usesAppProtocol(): boolean {
  return app.isPackaged || !process.env.ELECTRON_RENDERER_URL
}
