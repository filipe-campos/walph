import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { EditorView } from '@codemirror/view'
import { useStore } from '../../store'
import type { FileTab } from '../../types/tabs'
import { errorMessage } from '../../lib/errors'
import { loadLanguage } from '../../lib/language'
import { selectTab } from '../../lib/tabSelectors'
import { detectEol } from '../../lib/textFormat'
import { applyLanguage } from './documentConfig'
import { hasDocument } from './documentState'
import { loadDocument } from './documentStore'
import { getView, hideDocument, mountView, showDocument, shownTabId, unmountView } from './groupViews'
import { keepMyVersion, reloadFromDisk } from '../../diskSync'
import { refreshBaseline } from '../../gitBaselineActions'
import { clearReveal, consumePreserveFocus } from '../../tabActions'
import { setTabFormat } from '../../tabFormatActions'
import { prepareTabEditorConfig, readEncodingFor, resolveTabIndent } from '../../editorConfigActions'
import { useT } from '../../i18n'
import { Breadcrumbs } from './Breadcrumbs'

// Only the active group gets the "reveal" (several views may show the same tab).
function applyReveal(groupId: string): void {
  const view = getView(groupId)
  const { reveal, activeGroupId } = useStore.getState()
  if (!view || !reveal || activeGroupId !== groupId || reveal.tabId !== shownTabId(groupId)) return
  const doc = view.state.doc
  const line = doc.line(Math.min(Math.max(reveal.line, 1), doc.lines))
  const from = Math.min(line.from + reveal.column, line.to)
  const to = Math.min(from + reveal.length, line.to)
  view.dispatch({
    selection: { anchor: from, head: to },
    effects: EditorView.scrollIntoView(from, { y: 'center' })
  })
  view.focus()
  clearReveal()
}

// Reads in flight per tab: two groups showing the same not yet loaded tab (restored session) read it only once.
const loads = new Map<string, Promise<void>>()

function ensureLoaded(tabId: string, path: string): Promise<void> {
  if (hasDocument(tabId)) return Promise.resolve()
  let load = loads.get(tabId)
  if (!load) {
    // EditorConfig comes before the read: it may force the encoding and already sets the document indent and rulers.
    load = prepareTabEditorConfig(tabId, path)
      .then(() => {
        const tab = selectTab(tabId)(useStore.getState())
        // An encoding picked by the user (restored session) is forced; otherwise main detects it from the BOM.
        return window.api.fs.readText(path, tab?.kind === 'file' ? readEncodingFor(tab) : undefined)
      })
      .then(({ text, encoding }) => {
        // The tab may have been closed (or loaded by someone else) while the file was being read.
        if (hasDocument(tabId) || !useStore.getState().tabs.some((t) => t.id === tabId)) return
        const eol = detectEol(text)
        const { indent, fallback } = resolveTabIndent(tabId, text)
        loadDocument(tabId, text, indent)
        setTabFormat(tabId, eol, indent, fallback, encoding)
        void refreshBaseline(tabId)
        // Failing to load the language is not a file error: the text goes on without highlighting.
        const languageOf = (): string | null => {
          const now = selectTab(tabId)(useStore.getState())
          return now?.kind === 'file' ? now.language : null
        }
        const wanted = languageOf()
        void loadLanguage(path, wanted).then(
          (lang) => {
            // The user may have picked another mode while the parser loaded (the new choice applies by itself).
            if (lang && hasDocument(tabId) && languageOf() === wanted) applyLanguage(tabId, lang)
          },
          () => {}
        )
      })
      .finally(() => loads.delete(tabId))
    loads.set(tabId, load)
  }
  return load
}

function ConflictBar({ tabId }: { tabId: string }) {
  const t = useT()
  return (
    <div className="conflict-bar" role="alert">
      <i className="codicon codicon-warning" />
      <span className="conflict-text">{t.editor.conflict.message}</span>
      <button className="conflict-button primary" onClick={() => void reloadFromDisk(tabId)}>
        {t.editor.conflict.reload}
      </button>
      <button className="conflict-button" onClick={() => keepMyVersion(tabId)}>
        {t.editor.conflict.keepMine}
      </button>
    </div>
  )
}

export function CodeEditor({ groupId, tab }: { groupId: string; tab: FileTab | null }) {
  const hostRef = useRef<HTMLDivElement>(null)
  // The error stays tied to the tab that failed, so it does not show up on another tab.
  const [error, setError] = useState<{ tabId: string; message: string } | null>(null)
  const reveal = useStore((s) => s.reveal)
  const breadcrumbs = useStore((s) => s.settings['breadcrumbs.enabled'])
  const tabId = tab?.id ?? null
  const tabPath = tab?.path ?? null

  useEffect(() => {
    mountView(groupId, hostRef.current!)
    // A closed tab must not go back to the document store: the store decides.
    return () => unmountView(groupId, (id) => useStore.getState().tabs.some((t) => t.id === id))
  }, [groupId])

  // The path is only read on the first open; renaming does not reload the content.
  const pathToLoad = useEffectEvent(() => tabPath)
  useEffect(() => {
    const path = pathToLoad()
    if (!tabId || !path || !getView(groupId)) return
    let cancelled = false

    const show = (): void => {
      if (cancelled || !showDocument(groupId, tabId)) return
      // Only the active group takes focus (in the restored session every group shows the document at the same time).
      if (useStore.getState().activeGroupId === groupId && !consumePreserveFocus(tabId)) getView(groupId)?.focus()
      applyReveal(groupId)
    }

    if (hasDocument(tabId)) {
      show()
    } else {
      ensureLoaded(tabId, path).then(
        () => {
          if (cancelled) return
          setError((e) => (e?.tabId === tabId ? null : e))
          show()
        },
        (err) => {
          if (!cancelled) setError({ tabId, message: errorMessage(err) })
        }
      )
    }

    return () => {
      cancelled = true
      hideDocument(
        groupId,
        tabId,
        useStore.getState().tabs.some((t) => t.id === tabId)
      )
    }
  }, [tabId, groupId])

  useEffect(() => {
    if (reveal) applyReveal(groupId)
  }, [reveal, groupId])

  return (
    <div className="code-editor" hidden={!tab}>
      {tab && breadcrumbs && <Breadcrumbs groupId={groupId} tab={tab} />}
      {tab?.conflict && <ConflictBar tabId={tab.id} />}
      <div className="code-editor-host" ref={hostRef} />
      {error && error.tabId === tabId && (
        <div className="editor-message">
          <i className="codicon codicon-warning" /> {error.message}
        </div>
      )}
    </div>
  )
}
