import { memo, useMemo, type ReactNode } from 'react'
import type { GitFileStatus, GitRepoOperation } from '@shared/types'
import { isConflictStatus } from '@shared/gitStatusCodes'
import { selectGitOperation, selectGitBusy, useStore } from '../../store'
import { useScrollMemory } from '../common/useScrollMemory'
import { relativeTo } from '../../lib/path'
import { IconButton } from '../common/IconButton'
import { FileTreeRow } from '../common/FileTreeRow'
import { SectionRow } from '../common/SectionRow'
import { isItemRow, treeRowProps, useGroupedTree } from '../common/useGroupedTree'
import { CommitBox } from './CommitBox'
import { GitHistory } from './GitHistory'
import { GitStashes } from './GitStashes'
import {
  GIT_OPERATION_LABELS,
  abortGitOperation,
  discardAll,
  discardChanges,
  initRepository,
  pullChanges,
  pushChanges,
  refreshGit,
  stageFiles,
  unstageFiles
} from '../../gitActions'
import { openDiff, openFile } from '../../tabActions'
import { markConflictResolved } from '../../gitMergeActions'
import { gitStatusLabel } from '../../lib/gitStatusLabels'
import { useT } from '../../i18n'
import { Button } from '../common/Button'

type ChangeKind = 'merge' | 'staged' | 'changes'

interface ChangeGroup {
  path: ChangeKind
  items: GitFileStatus[]
}

const isConflict = (f: GitFileStatus): boolean => isConflictStatus(f.index, f.workingDir)

const fileKey = (f: GitFileStatus): string => f.path

const FileRow = memo(function FileRow({
  rowKey,
  tabStop,
  file,
  kind,
  root,
  busy
}: {
  rowKey: string
  tabStop: boolean
  file: GitFileStatus
  kind: ChangeKind
  root: string
  busy: boolean
}) {
  const t = useT()
  const staged = kind === 'staged'
  const code = kind === 'merge' ? 'U' : staged ? file.index : file.workingDir
  const letter = code === '?' ? 'U' : code
  const label = `${relativeTo(root, file.path)} — ${gitStatusLabel(code)}`
  return (
    <FileTreeRow
      {...treeRowProps(rowKey, tabStop)}
      role="treeitem"
      aria-level={2}
      aria-label={label}
      className="git-file"
      path={file.path}
      root={root}
      title={label}
      actions={
        kind === 'merge' ? (
          <>
            <IconButton icon="codicon-go-to-file" label={t.git.view.openFile} onClick={() => openFile(file.path)} />
            <IconButton
              icon="codicon-add"
              label={t.git.merge.markResolved}
              busy={busy}
              onClick={() => void markConflictResolved(file)}
            />
          </>
        ) : staged ? (
          <IconButton
            icon="codicon-remove"
            label={t.git.view.unstage}
            busy={busy}
            onClick={() => void unstageFiles([file.path])}
          />
        ) : (
          <>
            {file.workingDir !== 'D' && (
              <IconButton icon="codicon-go-to-file" label={t.git.view.openFile} onClick={() => openFile(file.path)} />
            )}
            <IconButton
              icon="codicon-discard"
              label={t.git.view.discard}
              busy={busy}
              onClick={() => void discardChanges([file])}
            />
            <IconButton
              icon="codicon-add"
              label={t.git.view.stage}
              busy={busy}
              onClick={() => void stageFiles([file.path])}
            />
          </>
        )
      }
      badge={<span className={`git-letter git-letter-${letter}`}>{letter}</span>}
    />
  )
})

/** Merge/rebase stopped waiting for the conflicts to be resolved, with the abort button. */
function OperationBanner({ operation, busy }: { operation: GitRepoOperation; busy: boolean }) {
  const t = useT()
  return (
    <div className="git-operation-banner" role="status">
      <i className="codicon codicon-git-merge" aria-hidden />
      <span className="git-operation-text">{t.git.merge.inProgress[operation]}</span>
      <Button size="xs" variant="ghost" disabled={busy} onClick={() => void abortGitOperation()}>
        {t.git.merge.abort[operation]}
      </Button>
    </div>
  )
}

export function GitView() {
  const t = useT()
  const git = useStore((s) => s.git)
  const root = useStore((s) => s.root)
  const busy = useStore(selectGitBusy)
  const operation = useStore(selectGitOperation)
  const [filesRef, onFilesScroll] = useScrollMemory<HTMLDivElement>(`${root}:git`)
  const files = git?.files
  const groups = useMemo<ChangeGroup[]>(() => {
    const list = files ?? []
    const merge = list.filter(isConflict)
    const rest = list.filter((f) => !isConflict(f))
    const staged = rest.filter((f) => f.index !== ' ' && f.index !== '?')
    const changes = rest.filter((f) => f.workingDir !== ' ')
    return [
      ...(merge.length > 0 ? [{ path: 'merge' as const, items: merge }] : []),
      ...(staged.length > 0 ? [{ path: 'staged' as const, items: staged }] : []),
      { path: 'changes', items: changes }
    ]
  }, [files])
  const { rows, listProps, tabStop, isOpen } = useGroupedTree({
    groups,
    visible: false,
    itemKey: fileKey,
    onActivateItem: (group, file) =>
      group.path === 'merge' ? openFile(file.path) : openDiff(file.path, group.path === 'staged')
  })
  // Outside the tree: it is not a treeitem, so the screen reader reaches it.
  const changesEmpty = isOpen('changes') && groups.at(-1)?.items.length === 0

  const header = (extra?: ReactNode) => (
    <div className="sidebar-title">
      <span>{t.git.view.title}</span>
      <div className="actions">{extra}</div>
    </div>
  )

  if (!root) {
    return (
      <div className="sidebar-view">
        {header()}
        <div className="empty-state">
          <p>{t.git.view.openFolder}</p>
        </div>
      </div>
    )
  }

  if (git && !git.isRepo) {
    return (
      <div className="sidebar-view">
        {header()}
        <div className="empty-state">
          <p>{t.git.view.notARepo}</p>
          <Button variant="primary" disabled={busy} onClick={() => void initRepository()}>
            {t.git.view.initRepo}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="sidebar-view">
      {header(
        <>
          <IconButton
            icon="codicon-arrow-down"
            label={t.git.view.pull}
            disabled={busy}
            onClick={() => void pullChanges()}
          />
          <IconButton
            icon="codicon-arrow-up"
            label={t.git.view.push}
            disabled={busy}
            onClick={() => void pushChanges()}
          />
          <IconButton
            icon="codicon-refresh"
            label={t.common.refresh}
            disabled={busy}
            onClick={() => void refreshGit()}
          />
        </>
      )}
      {operation && (
        <div className="progress-bar" role="progressbar" aria-label={GIT_OPERATION_LABELS[operation]}>
          <div className="progress-bar-fill" />
        </div>
      )}
      {git?.operation && <OperationBanner operation={git.operation} busy={busy} />}
      <CommitBox />
      <div className="git-files" ref={filesRef} onScroll={onFilesScroll}>
        <div {...listProps} role="tree" aria-label={t.git.view.title}>
          {groups.map((group) => {
            const open = isOpen(group.path)
            const staged = group.path === 'staged'
            const merge = group.path === 'merge'
            const groupRows = rows.filter((row) => row.group === group)
            return (
              <div key={group.path} className="git-section">
                {groupRows.map((row) =>
                  isItemRow(row) ? (
                    <FileRow
                      key={row.key}
                      rowKey={row.key}
                      tabStop={row.key === tabStop}
                      file={row.item}
                      kind={group.path}
                      root={root}
                      busy={busy}
                    />
                  ) : (
                    <SectionRow
                      key={row.key}
                      rowKey={row.key}
                      tabStop={row.key === tabStop}
                      title={merge ? t.git.merge.title : staged ? t.git.view.staged : t.git.view.changes}
                      count={group.items.length}
                      open={open}
                      actions={
                        merge ? null : staged ? (
                          <IconButton
                            icon="codicon-remove"
                            label={t.git.view.unstageAll}
                            busy={busy}
                            onClick={() => void unstageFiles(group.items.map((f) => f.path))}
                          />
                        ) : (
                          <>
                            <IconButton
                              icon="codicon-discard"
                              label={t.git.view.discardAll}
                              busy={busy || group.items.length === 0}
                              onClick={() => void discardAll()}
                            />
                            <IconButton
                              icon="codicon-add"
                              label={t.git.view.stageAll}
                              busy={busy || group.items.length === 0}
                              onClick={() => void stageFiles(group.items.map((f) => f.path))}
                            />
                          </>
                        )
                      }
                    />
                  )
                )}
              </div>
            )
          })}
        </div>
        {changesEmpty && <div className="empty-line">{t.git.view.noChanges}</div>}
        <GitStashes />
        <GitHistory root={root} />
      </div>
    </div>
  )
}
