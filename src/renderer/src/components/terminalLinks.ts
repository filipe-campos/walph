// Clickable terminal links: URLs (web-links addon) and `file:line:column` paths (own provider). Opening
// requires ⌘-click (macOS) / Ctrl-click, as in VS Code: a plain click still selects text.
import type { IDisposable, ILink, ILinkHandler, Terminal } from '@xterm/xterm'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { t } from '@shared/i18n'
import { findFileLinks, joinRows, rangeOf, type CellInfo, type FileLinkCandidate } from '../lib/terminalLinks'
import { openFile } from '../tabActions'

const isMac = window.api.platform === 'darwin'
const hasModifier = (e: MouseEvent): boolean => (isMac ? e.metaKey : e.ctrlKey)

// A very long logical line (minified output) is not worth the full scan on every hover.
const MAX_ROWS = 30
// Validating is a round trip to main per path: remembers the result for a few seconds (the mouse wanders over the same
// line).
const CACHE_MS = 3000

let hint: HTMLDivElement | null = null

function showHint(event: MouseEvent): void {
  if (!hint) {
    hint = document.createElement('div')
    hint.className = 'terminal-link-hint'
    hint.setAttribute('role', 'tooltip')
    document.body.appendChild(hint)
  }
  hint.textContent = t().terminal.linkHint(isMac ? '⌘' : 'Ctrl')
  const x = Math.min(event.clientX + 12, window.innerWidth - 180)
  hint.style.left = `${Math.max(4, x)}px`
  hint.style.top = `${event.clientY + 18}px`
  hint.hidden = false
}

function hideLinkHint(): void {
  if (hint) hint.hidden = true
}

/** OSC 8 hyperlinks (the program picks the target): same rules as URLs, and only http(s)/mailto open. */
export const terminalLinkHandler: ILinkHandler = {
  allowNonHttpProtocols: false,
  activate: (event, text) => {
    if (!hasModifier(event)) return
    try {
      const { protocol } = new URL(text)
      if (protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:') window.open(text)
    } catch {
      // A target that is not even a URL: ignore.
    }
  },
  hover: (event) => showHint(event),
  leave: hideLinkHint
}

function readRow(term: Terminal, index: number): CellInfo[] | null {
  const line = term.buffer.active.getLine(index)
  if (!line) return null
  const cells: CellInfo[] = []
  for (let x = 0; x < term.cols; x++) {
    const cell = line.getCell(x)
    if (cell) cells.push({ chars: cell.getChars(), width: cell.getWidth() })
  }
  return cells
}

/**
 * Registers URLs and file links in the terminal. The return undoes everything (the addon is disposed with the
 * terminal).
 */
export function registerTerminalLinks(term: Terminal, id: string): IDisposable {
  term.loadAddon(
    new WebLinksAddon(
      (event, uri) => {
        // Only http(s) arrives here; main still filters what `window.open` can open.
        if (hasModifier(event)) window.open(uri)
      },
      { hover: (event) => showHint(event), leave: hideLinkHint }
    )
  )

  let disposed = false
  const cache = new Map<string, { at: number; abs: Promise<string | null> }>()
  const resolve = (path: string): Promise<string | null> => {
    const now = Date.now()
    for (const [key, entry] of cache) if (now - entry.at >= CACHE_MS) cache.delete(key)
    const hit = cache.get(path)
    if (hit) return hit.abs
    const abs = window.api.terminal.resolveLink(id, path).catch(() => null)
    cache.set(path, { at: Date.now(), abs })
    return abs
  }

  const open = (abs: string, c: FileLinkCandidate): void => {
    hideLinkHint()
    // Line from 1 and column from 0 in `Reveal`; `Reveal` also takes focus to the editor.
    if (c.line === undefined) openFile(abs, undefined, { preview: true })
    else openFile(abs, { line: c.line, column: Math.max(0, (c.column ?? 1) - 1), length: 0 }, { preview: true })
  }

  const provider = term.registerLinkProvider({
    provideLinks(bufferLineNumber, callback) {
      // The logical line may have been wrapped into several visual lines: join them all.
      let first = bufferLineNumber - 1
      while (first > 0 && term.buffer.active.getLine(first)?.isWrapped) first--
      const rows: CellInfo[][] = []
      for (let i = first; rows.length < MAX_ROWS; i++) {
        if (i > first && !term.buffer.active.getLine(i)?.isWrapped) break
        const row = readRow(term, i)
        if (!row) break
        rows.push(row)
      }
      const joined = joinRows(rows)
      const candidates = findFileLinks(joined.text)
      if (candidates.length === 0) return callback(undefined)

      void Promise.all(candidates.map((c) => resolve(c.path))).then((resolved) => {
        if (disposed) return callback(undefined)
        const links: ILink[] = []
        candidates.forEach((c, i) => {
          const abs = resolved[i]
          const range = abs ? rangeOf(joined, c.start, c.end, first + 1) : null
          if (!abs || !range) return
          links.push({
            range,
            text: joined.text.slice(c.start, c.end),
            activate: (event) => {
              if (hasModifier(event)) open(abs, c)
            },
            hover: (event) => showHint(event),
            leave: hideLinkHint
          })
        })
        callback(links.length > 0 ? links : undefined)
      })
    }
  })

  return {
    dispose: () => {
      disposed = true
      cache.clear()
      provider.dispose()
      hideLinkHint()
    }
  }
}
