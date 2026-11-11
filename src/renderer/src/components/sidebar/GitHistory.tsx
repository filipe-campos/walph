import { memo, useMemo, useRef, useState } from 'react'
import type { GitCommit, GitCommitFile } from '@shared/types'
import { useStore } from '../../store'
import { relativeTo } from '../../lib/path'
import { formatDate, relativeTime } from '../../lib/relativeTime'
import { FileTreeRow } from '../common/FileTreeRow'
import { Chevron } from '../common/Chevron'
import { Section } from '../common/Section'
import { isItemRow, treeRowProps, useGroupedTree } from '../common/useGroupedTree'
import { useRequest } from '../common/useRequest'
import { attempt } from '../../attempt'
import { loadCommitFiles, loadHistory, toggleHistory } from '../../gitHistoryActions'
import { openCommitDiff } from '../../tabActions'
import { gitStatusLabel } from '../../lib/gitStatusLabels'
import { useT } from '../../i18n'

interface CommitGroup {
  path: string
  commit: GitCommit
  items: GitCommitFile[]
}

/** Open commits and files already read, of the `root` folder (another folder = nothing open). */
interface Expansion {
  root: string
  open: ReadonlySet<string>
  files: ReadonlyMap<string, GitCommitFile[]>
}

const emptyExpansion = (root: string): Expansion => ({ root, open: new Set(), files: new Map() })

const commitFileKey = (file: GitCommitFile): string => `${file.status}:${file.path}`

const CommitRow = memo(function CommitRow({
  rowKey,
  tabStop,
  commit,
  open
}: {
  rowKey: string
  tabStop: boolean
  commit: GitCommit
  open: boolean
}) {
  const tooltip = `${commit.subject}\n${commit.hash}\n${commit.author} <${commit.email}>\n${formatDate(commit.date)}`
  return (
    <div
      {...treeRowProps(rowKey, tabStop)}
      role="treeitem"
      aria-level={1}
      aria-expanded={open}
      className="tree-row commit-row"
      data-hash={commit.hash}
      title={tooltip}
    >
      <Chevron open={open} />
      <span className="commit-text">
        <span className="ellipsis commit-subject">{commit.subject}</span>
        <span className="ellipsis muted commit-meta">
          {commit.shortHash} · {commit.author} · {relativeTime(commit.date)}
        </span>
      </span>
    </div>
  )
})

const CommitFileRow = memo(function CommitFileRow({
  rowKey,
  tabStop,
  file,
  root
}: {
  rowKey: string
  tabStop: boolean
  file: GitCommitFile
  root: string
}) {
  const t = useT()
  const letter = file.status[0] ?? 'M'
  const rel = relativeTo(root, file.path)
  const label = `${rel} — ${gitStatusLabel(letter)}${file.oldPath ? ` ${t.git.history.renamedFrom(relativeTo(root, file.oldPath))}` : ''}`
  return (
    <FileTreeRow
      {...treeRowProps(rowKey, tabStop)}
      role="treeitem"
      aria-level={2}
      aria-label={label}
      className="commit-file"
      path={file.path}
      root={root}
      title={label}
      badge={<span className={`git-letter git-letter-${letter}`}>{letter}</span>}
    />
  )
})

export function GitHistory({ root }: { root: string }) {
  const t = useT()
  const open = useStore((s) => s.historyOpen)
  const history = useStore((s) => s.gitHistory)
  const ref = useRef<HTMLDivElement>(null)
  const [expansion, setExpansion] = useState<Expansion>(() => emptyExpansion(root))
  if (expansion.root !== root) setExpansion(emptyExpansion(root))

  // "Show History": scrolls the section into view.
  useRequest('historyScroll', () => ref.current?.scrollIntoView({ block: 'nearest' }))

  // A read that ends after the folder switch does not write to the new folder state.
  const update = (change: (e: Expansion) => Partial<Expansion>): void =>
    setExpansion((prev) => (prev.root === root ? { ...prev, ...change(prev) } : prev))

  const setOpen = (hash: string, next: boolean): void => {
    update((e) => {
      const set = new Set(e.open)
      if (next) set.add(hash)
      else set.delete(hash)
      return { open: set }
    })
    if (!next || expansion.files.has(hash)) return
    // On failure the commit closes without storing anything, so reopening tries again.
    void attempt(() => loadCommitFiles(hash), {
      quiet: () => useStore.getState().root !== root,
      fallback: null
    }).then((files) => {
      if (files) update((e) => ({ files: new Map(e.files).set(hash, files) }))
      else
        update((e) => {
          const set = new Set(e.open)
          set.delete(hash)
          return { open: set }
        })
    })
  }

  // Status bar request ("open the last commit"): waits for the commit to show up in the list, opens it and scrolls to
  // it.
  const commits = history?.commits
  useRequest(
    'historyReveal',
    ({ hash }) => {
      setOpen(hash, true)
      ref.current?.querySelector(`[data-hash="${CSS.escape(hash)}"]`)?.scrollIntoView({ block: 'nearest' })
    },
    ({ hash }) => !!commits?.some((c) => c.hash === hash)
  )

  const groups = useMemo<CommitGroup[]>(
    () =>
      (commits ?? []).map((commit) => ({ path: commit.hash, commit, items: expansion.files.get(commit.hash) ?? [] })),
    [commits, expansion.files]
  )
  const collapsed = useMemo(
    () => Object.fromEntries((commits ?? []).map((c) => [c.hash, !expansion.open.has(c.hash)])),
    [commits, expansion.open]
  )
  const { rows, listProps, tabStop, isOpen } = useGroupedTree({
    groups,
    visible: false,
    itemKey: commitFileKey,
    collapsed,
    onToggleGroup: (hash) => setOpen(hash, !expansion.open.has(hash)),
    onActivateItem: (group, file) => openCommitDiff(group.path, file)
  })

  return (
    <div ref={ref}>
      <Section title={t.git.history.title} open={open} onToggle={toggleHistory}>
        <div {...listProps} role="tree" aria-label={t.git.history.title}>
          {rows.map((row) => {
            if (isItemRow(row))
              return (
                <CommitFileRow
                  key={row.key}
                  rowKey={row.key}
                  tabStop={row.key === tabStop}
                  file={row.item}
                  root={root}
                />
              )
            const { commit } = row.group
            const commitOpen = isOpen(commit.hash)
            const files = expansion.files.get(commit.hash)
            return [
              <CommitRow
                key={row.key}
                rowKey={row.key}
                tabStop={row.key === tabStop}
                commit={commit}
                open={commitOpen}
              />,
              commitOpen && (!files || files.length === 0) && (
                <div key={`${row.key}:note`} className="empty-line commit-files-note">
                  {files ? t.git.history.noFiles : t.common.loading}
                </div>
              )
            ]
          })}
        </div>
        {history && history.commits.length === 0 && !history.loading && (
          <div className="empty-line">{t.git.history.noCommits}</div>
        )}
        {history?.hasMore && (
          <button
            type="button"
            className="tree-row load-more"
            disabled={history.loading}
            onClick={() => void loadHistory(true)}
          >
            <i
              className={`codicon ${history.loading ? 'codicon-loading codicon-modifier-spin' : 'codicon-ellipsis'}`}
            />
            <span className="tree-label">{history.loading ? t.common.loading : t.git.history.loadMore}</span>
          </button>
        )}
        {(!history || (history.loading && history.commits.length === 0)) && (
          <div className="empty-line">{t.common.loading}</div>
        )}
      </Section>
    </div>
  )
}
