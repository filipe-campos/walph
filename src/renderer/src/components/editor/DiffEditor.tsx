import { useEffect, useRef, useState } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { MergeView } from '@codemirror/merge'
import { forcedEncodingFor, selectThemeName, useStore } from '../../store'
import type { DiffTab } from '../../types/tabs'
import { errorMessage } from '../../lib/errors'
import { loadLanguage } from '../../lib/language'
import { basename, relativeTo } from '../../lib/path'
import { gitFileFingerprint } from '../../lib/staleWork'
import { findTheme } from '../../themes'
import type { ClaudePermissionRequest } from '@shared/types'
import { ProposalBar } from '../claude/ProposalBar'
import { baseSetup, editorBase, editorPhrases, phrasesCompartment, themeCompartment } from './setup'
import { openFile } from '../../tabActions'
import { bufferTabIds, readCompareSide, swapCompareSides } from '../../compareActions'
import { subscribeDocChanges } from './documentState'
import { useT } from '../../i18n'
import { useFocusRegion } from '../common/useFocusRegion'
import { IconButton } from '../common/IconButton'
import { diffActions, runDiffHunk } from '../../gitHunkActions'
import { diffHunkGutter, registerDiffViews } from './diffHunks'

type EditRequest = Extract<ClaudePermissionRequest, { kind: 'edit' }>

/** Typing in the compared file redoes the diff at most once per this interval. */
const BUFFER_REFRESH_MS = 300

async function loadSides(root: string, tab: DiffTab, edit?: EditRequest): Promise<[string, string]> {
  const { git, fs } = window.api
  // Claude's proposal: the content already came in the request (disk ↔ proposed text).
  if (edit) return [edit.original, edit.proposed]
  if (tab.compare) return Promise.all([readCompareSide(tab.compare.left), readCompareSide(tab.compare.right)])
  if (tab.commit) {
    const diff = await git.commitDiff(root, tab.commit.hash, tab.commit.file)
    return [diff.original, diff.modified]
  }
  // Both sides with the encoding picked on the file tab (if any), otherwise from the BOM.
  const encoding = forcedEncodingFor(tab.path)
  if (tab.mergeCompare)
    return Promise.all([git.show(root, tab.path, 'OURS', encoding), git.show(root, tab.path, 'THEIRS', encoding)])
  if (tab.staged)
    return Promise.all([git.show(root, tab.path, 'HEAD', encoding), git.show(root, tab.path, 'INDEX', encoding)])
  // File deleted in the working tree: empty right side.
  return Promise.all([
    git.show(root, tab.path, 'INDEX', encoding),
    fs
      .readText(tab.path, encoding)
      .then((f) => f.text)
      .catch(() => '')
  ])
}

/**
 * One side of a comparison in the header: path relative to the folder (absolute, if outside) and "(saved)" on the disk
 * side.
 */
function sideLabel(root: string | null, side: { path: string; saved?: boolean }, savedSuffix: string): string {
  const name = root ? relativeTo(root, side.path) || basename(side.path) : side.path
  return side.saved ? `${name} ${savedSuffix}` : name
}

/** The proposed side is the last `.cm-content` of the MergeView. */
function focusLastSide(el: HTMLElement): boolean {
  const contents = el.querySelectorAll<HTMLElement>('.cm-content')
  const last = contents[contents.length - 1]
  last?.focus()
  return !!last
}

export function DiffEditor({ tab }: { tab: DiffTab }) {
  const t = useT()
  const hostRef = useRef<HTMLDivElement>(null)
  const regionRef = useFocusRegion<HTMLDivElement>('diffEditor', { focus: focusLastSide })
  const root = useStore((s) => s.root)
  // Reloads the diff when the git status changes (file saved, stage etc.); a commit's diff is immutable.
  const immutable = !!(tab.commit ?? tab.proposal)
  const compare = tab.compare
  // Only this file's status (stable string) and the watcher revision: other files changing do not recreate the
  // MergeView.
  const gitVersion = useStore((s) =>
    immutable
      ? ''
      : compare
        ? `${s.fileRevs[compare.left.path] ?? 0}:${s.fileRevs[compare.right.path] ?? 0}`
        : gitFileFingerprint(s.git?.files.find((f) => f.path === tab.path)) +
          ':' +
          (s.fileRevs[tab.path] ?? 0) +
          // A new HEAD changes the left side of the diff even with the same file status.
          ':' +
          (s.lastCommit?.hash ?? '')
  )
  // Comparison with the buffer of an open tab: editing the file updates the diff (with slack between keystrokes).
  const [bufferRev, setBufferRev] = useState(0)
  useEffect(() => {
    if (!compare) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = subscribeDocChanges((tabId) => {
      if (timer || !bufferTabIds(compare).includes(tabId)) return
      timer = setTimeout(() => {
        timer = undefined
        setBufferRev((r) => r + 1)
      }, BUFFER_REFRESH_MS)
    })
    return () => {
      stop()
      clearTimeout(timer)
    }
  }, [compare])
  const proposal = tab.proposal
  // The proposal lives in the conversation permission request; once answered or cancelled, the request is gone and the
  // tab closes.
  const edit = useStore((s): EditRequest | undefined => {
    if (!proposal) return undefined
    const request = s.claude.conversations
      .find((c) => c.id === proposal.conversationId)
      ?.permissions.find((p) => p.requestId === proposal.requestId)
    return request?.kind === 'edit' ? request : undefined
  })
  const [error, setError] = useState<string | null>(null)
  const mergeRef = useRef<MergeView | null>(null)
  // Recreating the MergeView (staging a hunk changes the status) must not scroll back to the top.
  const scrollRef = useRef<{ tabId: string; top: number } | null>(null)
  const themeName = useStore(selectThemeName)

  // Switching themes reconfigures both views instead of reloading the diff.
  useEffect(() => {
    const merge = mergeRef.current
    if (!merge) return
    const effects = themeCompartment.reconfigure(findTheme(themeName).editor)
    merge.a.dispatch({ effects })
    merge.b.dispatch({ effects })
  }, [themeName])

  useEffect(() => {
    const merge = mergeRef.current
    if (!merge) return
    const effects = phrasesCompartment.reconfigure(editorPhrases())
    merge.a.dispatch({ effects })
    merge.b.dispatch({ effects })
  }, [t])

  useEffect(() => {
    if (!root || (proposal && !edit)) return
    let cancelled = false
    let merge: MergeView | null = null

    Promise.all([loadSides(root, tab, edit), loadLanguage(tab.path)])
      .then(([[a, b], lang]) => {
        if (cancelled || !hostRef.current) return
        const extensions = [
          baseSetup,
          editorBase,
          // The theme in effect at mount time (the effect above handles the following switches).
          themeCompartment.of(findTheme(selectThemeName(useStore.getState())).editor),
          phrasesCompartment.of(editorPhrases()),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          lang ?? []
        ]
        const actions = diffActions(tab)
        const hunkGutter = actions.length
          ? diffHunkGutter(actions, (action, range) => runDiffHunk(tab.id, action, range))
          : []
        hostRef.current.replaceChildren()
        merge = new MergeView({
          a: { doc: a, extensions },
          b: { doc: b, extensions: [extensions, hunkGutter] },
          parent: hostRef.current,
          collapseUnchanged: { margin: 3, minSize: 6 },
          gutter: true
        })
        mergeRef.current = merge
        registerDiffViews(tab.id, { original: merge.a, modified: merge.b })
        const saved = scrollRef.current
        if (saved?.tabId === tab.id) merge.dom.scrollTop = saved.top
      })
      .catch((err) => !cancelled && setError(errorMessage(err)))

    return () => {
      cancelled = true
      mergeRef.current = null
      if (merge) {
        scrollRef.current = { tabId: tab.id, top: merge.dom.scrollTop }
        registerDiffViews(tab.id, null)
        merge.destroy()
      }
    }
  }, [root, tab, gitVersion, bufferRev, proposal, edit])

  return (
    <div ref={regionRef} className="diff-editor">
      <div className="diff-header">
        {compare ? (
          <span>
            {t.editor.diff.compareFiles(
              sideLabel(root, compare.left, t.editor.diff.savedSuffix),
              sideLabel(root, compare.right, t.editor.diff.savedSuffix)
            )}
          </span>
        ) : (
          <span>
            {root ? relativeTo(root, tab.path) : tab.path}
            <span className="muted">
              {' '}
              —{' '}
              {tab.commit
                ? t.editor.diff.commitReadOnly(tab.commit.hash.slice(0, 7))
                : tab.proposal
                  ? t.editor.diff.claudeProposal
                  : tab.mergeCompare
                    ? t.git.merge.compareHeader
                    : tab.staged
                      ? t.editor.diff.headToStaged
                      : t.editor.diff.stagedToWorkingTree}
            </span>
          </span>
        )}
        {compare && (
          <IconButton
            label={t.commands.titles['editor.swapDiffSides']}
            onClick={() => swapCompareSides(tab.id)}
            icon="codicon-arrow-swap"
          />
        )}
        {!tab.commit && !edit?.isNewFile && (
          <IconButton label={t.editor.diff.openFile} onClick={() => openFile(tab.path)} icon="codicon-go-to-file" />
        )}
      </div>
      {proposal && edit && <ProposalBar proposal={proposal} isNewFile={edit.isNewFile} />}
      {proposal && !edit ? (
        <div className="editor-message">{t.editor.diff.proposalGone}</div>
      ) : error ? (
        <div className="editor-message">{error}</div>
      ) : (
        <div className="diff-host" ref={hostRef} />
      )}
    </div>
  )
}
