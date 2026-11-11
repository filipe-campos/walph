import { memo, useMemo } from 'react'
import type { GitStash } from '@shared/types'
import { selectGitBusy, useStore } from '../../store'
import { relativeTime } from '../../lib/relativeTime'
import { IconButton } from '../common/IconButton'
import { SectionRow } from '../common/SectionRow'
import { isItemRow, treeRowProps, useGroupedTree } from '../common/useGroupedTree'
import { stashApply, stashDrop, stashPop } from '../../gitActions'
import { openStashMessagePicker } from '../../gitHistoryActions'
import { useT } from '../../i18n'

const stashKey = (stash: GitStash): string => stash.hash

const StashRow = memo(function StashRow({
  rowKey,
  tabStop,
  stash,
  busy
}: {
  rowKey: string
  tabStop: boolean
  stash: GitStash
  busy: boolean
}) {
  const t = useT()
  const label = stash.message || `stash@{${stash.index}}`
  const title = `stash@{${stash.index}}: ${label}`
  return (
    <div
      {...treeRowProps(rowKey, tabStop)}
      role="treeitem"
      aria-level={2}
      aria-label={title}
      className="tree-row git-file"
      title={title}
    >
      <i className="codicon codicon-archive" />
      <span className="tree-label">{label}</span>
      <span className="row-actions" onClick={(e) => e.stopPropagation()}>
        <IconButton
          icon="codicon-debug-step-back"
          label={t.git.stashes.apply}
          busy={busy}
          onClick={() => void stashApply(stash.index, stash.hash)}
        />
        <IconButton
          icon="codicon-git-pull-request-go-to-changes"
          label={t.git.stashes.pop}
          busy={busy}
          onClick={() => void stashPop(stash.index, stash.hash)}
        />
        <IconButton
          icon="codicon-trash"
          label={t.git.stashes.drop}
          busy={busy}
          onClick={() => void stashDrop(stash.index, stash.hash)}
        />
      </span>
      <span className="muted git-row-date">{relativeTime(stash.date)}</span>
    </div>
  )
})

export function GitStashes() {
  const t = useT()
  const stashes = useStore((s) => s.stashes)
  const busy = useStore(selectGitBusy)
  const groups = useMemo(() => [{ path: 'stashes', items: stashes }], [stashes])
  // A stash has nothing to open: Enter/click on the row does nothing, the actions come through Tab.
  const { rows, listProps, tabStop, isOpen } = useGroupedTree({
    groups,
    visible: false,
    itemKey: stashKey,
    onActivateItem: () => {}
  })
  const open = isOpen('stashes')

  return (
    <div className="git-section">
      <div {...listProps} role="tree" aria-label={t.git.stashes.title}>
        {rows.map((row) =>
          isItemRow(row) ? (
            <StashRow key={row.key} rowKey={row.key} tabStop={row.key === tabStop} stash={row.item} busy={busy} />
          ) : (
            <SectionRow
              key={row.key}
              rowKey={row.key}
              tabStop={row.key === tabStop}
              title={t.git.stashes.title}
              count={stashes.length}
              open={open}
              actions={
                <IconButton
                  icon="codicon-archive"
                  label={t.git.stashes.save}
                  busy={busy}
                  onClick={openStashMessagePicker}
                />
              }
            />
          )
        )}
      </div>
      {open && stashes.length === 0 && <div className="empty-line">{t.git.stashes.empty}</div>}
    </div>
  )
}
