import { useCallback, useEffect, useRef, useState } from 'react'
import { selectThemeName, useStore } from '../../store'
import type { MarkdownPreviewTab } from '../../types/tabs'
import { errorMessage } from '../../lib/errors'
import { highlightCodeBlocks } from '../../lib/lspMarkdown'
import { renderDiagrams } from '../../lib/markdownDiagrams'
import { findTheme } from '../../themes'
import { loadMarkdownLibs, markdownLibs } from '../../lib/markdownLibs'
import {
  assignHeadingSlugs,
  findAnchorTarget,
  renderMarkdownHtml,
  resolveImage,
  resolveLink
} from '../../lib/markdownPreview'
import { basename } from '../../lib/path'
import { hasDocument, subscribeDocChanges } from './documentState'
import { currentState } from './groupViews'
import { knownImage, openLinkedFile, readCachedImage, readSourceText } from '../../fileViewActions'
import { useT } from '../../i18n'
import type { Messages } from '@shared/i18n'

// Wait between the last edit and the new render: typing must not re-render the document on every keystroke.
const DEBOUNCE_MS = 150

/**
 * Replaces the image with a placeholder with the alt text (remote, unreadable or without a source): nothing is loaded.
 */
function placeholder(img: HTMLImageElement, reason: string, t: Messages): void {
  const alt = img.getAttribute('alt') ?? ''
  const box = document.createElement('span')
  box.className = 'md-image-missing'
  box.setAttribute('role', 'img')
  box.setAttribute('aria-label', alt || t.editor.markdown.image)
  box.title = reason
  const icon = document.createElement('i')
  icon.className = 'codicon codicon-file-media'
  const text = document.createElement('span')
  text.textContent = alt || t.editor.markdown.imageNotLoaded
  box.append(icon, text)
  img.replaceWith(box)
}

/**
 * Gives `src` to the document images: local ones through main, embedded ones directly; remote ones become placeholders.
 */
function loadImages(root: HTMLElement, mdPath: string, t: Messages): void {
  for (const img of root.querySelectorAll<HTMLImageElement>('img[data-raw-src]')) {
    const source = resolveImage(img.getAttribute('data-raw-src'), mdPath)
    if (source.kind === 'inline') img.src = source.url
    else if (source.kind === 'local') {
      // Already read: the `src` goes in right away (re-rendering on every keystroke must not flicker or move the
      // layout);
      // past the TTL, the read is renewed in the background.
      const known = knownImage(source.path)
      if (known) {
        img.src = known
        void readCachedImage(source.path).catch(() => {})
        continue
      }
      readCachedImage(source.path).then(
        (url) => {
          if (img.isConnected) img.src = url
        },
        () => img.isConnected && placeholder(img, t.editor.markdown.imageLoadFailed, t)
      )
    } else {
      const { markdown } = t.editor
      placeholder(img, source.kind === 'remote' ? markdown.remoteImages : markdown.noImageSource, t)
    }
  }
}

type Source = { key: string; text: string } | { key: string; error: string }

/**
 * Markdown preview of a file. Shows the BUFFER of the file tab (what is being typed), debounced; if the
 * tab is not loaded in the editor, reads from disk. Closing the source tab does not close the preview: it reads from
 * disk instead.
 */
export function MarkdownPreview({ tab }: { tab: MarkdownPreviewTab }) {
  const t = useT()
  const rootRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const sourceId = useStore((s) => s.tabs.find((t) => t.kind === 'file' && t.path === tab.path)?.id ?? null)
  const themeName = useStore(selectThemeName)
  // The result belongs to the preview + source pair: changing either discards the old text without any effect.
  const key = `${tab.id}|${tab.path}|${sourceId ?? ''}`
  const [source, setSource] = useState<Source | null>(null)
  const current = source?.key === key ? source : null
  const scheduleRef = useRef<((delay: number) => void) | null>(null)
  // The watcher notifies by path (`fileRevs`); only applies to a source that is not loaded in the editor.
  const diskRev = useStore((s) => s.fileRevs[tab.path] ?? 0)
  const seenRev = useRef(diskRev)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let seq = 0
    let disposed = false

    const refresh = (): void => {
      const mine = ++seq
      if (sourceId && hasDocument(sourceId)) {
        const state = currentState(sourceId)
        if (state) setSource({ key, text: state.doc.toString() })
        return
      }
      readSourceText(tab.path).then(
        (text) => !disposed && mine === seq && setSource({ key, text }),
        (err) => !disposed && mine === seq && setSource({ key, error: errorMessage(err) })
      )
    }
    const schedule = (delay: number): void => {
      clearTimeout(timer)
      timer = setTimeout(refresh, delay)
    }

    schedule(0)
    scheduleRef.current = schedule
    const offDoc = subscribeDocChanges((id) => id === sourceId && schedule(DEBOUNCE_MS))
    return () => {
      disposed = true
      scheduleRef.current = null
      clearTimeout(timer)
      offDoc()
    }
  }, [key, sourceId, tab.path])

  // A source tab not loaded yet will be read from disk: the watcher notifies when the file changes.
  useEffect(() => {
    if (seenRev.current === diskRev) return
    seenRev.current = diskRev
    if (!(sourceId && hasDocument(sourceId))) scheduleRef.current?.(DEBOUNCE_MS)
  }, [diskRev, sourceId])

  const text = current && 'text' in current ? current.text : null
  // marked/dompurify load on the first preview; until then the body stays empty.
  const [libsReady, setLibsReady] = useState(() => !!markdownLibs())
  useEffect(() => {
    if (libsReady) return
    let on = true
    void loadMarkdownLibs()
      .then(() => on && setLibsReady(true))
      .catch(() => {})
    return () => {
      on = false
    }
  }, [libsReady])
  useEffect(() => {
    const body = bodyRef.current
    const root = rootRef.current
    if (!body || !root || text === null || !libsReady) return
    // Re-rendering replaces the content: keeps where the user was reading.
    const scrollTop = root.scrollTop
    body.innerHTML = renderMarkdownHtml(text)
    assignHeadingSlugs(body)
    highlightCodeBlocks(body)
    void renderDiagrams(body, findTheme(themeName).kind)
    loadImages(body, tab.path, t)
    root.scrollTop = scrollTop
    // Theme and language enter as dependencies: the highlight colors and the image placeholders come from them at paint
    // time.
  }, [text, tab.path, themeName, libsReady, t])

  const follow = useCallback(
    (link: Element): void => {
      const target = resolveLink(link.getAttribute('data-raw-href'), tab.path)
      const body = bodyRef.current
      if (target.kind === 'anchor') {
        findAnchorTarget(body!, target.id)?.scrollIntoView({ block: 'start' })
      } else if (target.kind === 'external') {
        window.open(target.url, '_blank')
      } else if (target.kind === 'file') {
        if (target.path === tab.path && target.anchor) {
          findAnchorTarget(body!, target.anchor)?.scrollIntoView({ block: 'start' })
          return
        }
        void openLinkedFile(target.path, tab.id)
      }
    },
    [tab.id, tab.path]
  )

  return (
    <div
      className="markdown-preview"
      ref={rootRef}
      // Focusable by click (not by Tab): gives the `markdownPreviewFocus` context and keyboard scrolling.
      tabIndex={-1}
      role="document"
      aria-label={t.editor.tabs.previewTitle(basename(tab.path))}
      onClick={(e) => {
        const link = (e.target as Element).closest('a[data-raw-href]')
        if (!link) return
        e.preventDefault()
        follow(link)
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return
        const link = (e.target as Element).closest('a[data-raw-href]')
        if (!link) return
        e.preventDefault()
        follow(link)
      }}
    >
      {current && 'error' in current ? (
        <div className="editor-message">
          <i className="codicon codicon-warning" /> {current.error}
        </div>
      ) : (
        <div className="markdown-body" ref={bodyRef} />
      )}
    </div>
  )
}
