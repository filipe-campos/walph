import type { KeyboardEvent, MouseEvent } from 'react'
import type { RecentFolder } from '@shared/types'
import { useStore } from '../store'
import { basename, dirname } from '../lib/path'
import { openedAgo, openWorkspaceOf } from '../lib/welcomeRecents'
import { STATUS_LABELS } from '../lib/agentStatusLabels'
import { FileIcon } from './common/FileIcon'
import { Icon } from './common/Icon'
import { StatusDot } from './common/StatusDot'
import { removeRecentFolder } from '../recentActions'
import { useT } from '../i18n'
import { IconButton } from './common/IconButton'

/**
 * Claude dot when the folder is already open in another workspace of the window (never color only: text for screen
 * readers).
 */
export function OpenFlag({ path }: { path: string }) {
  const t = useT()
  const status = useStore((s) => openWorkspaceOf(s.workspaces?.workspaces, path, window.api.platform)?.status ?? null)
  if (!status) return null
  const label = status === 'idle' ? '' : ` · ${STATUS_LABELS[status]}`
  return (
    <span className="recent-live" title={`${t.app.recent.openElsewhere}${label}`} data-status={status}>
      <StatusDot status={status} />
      <span className="sr-only">{t.app.recent.openElsewhere}</span>
    </span>
  )
}

/**
 * Row of a recent folder (Welcome and the add workspace modal). With `onToggle` the row is selectable
 * (⌘/Ctrl-click or space); without it, it only opens. `highlighted` is the active item of the modal arrow navigation.
 */
export function RecentRow({
  folder,
  selected = false,
  onToggle,
  onOpen,
  hintId,
  highlighted = false,
  optionId
}: {
  folder: RecentFolder
  selected?: boolean
  onToggle?: (path: string) => void
  onOpen: (path: string) => void
  hintId?: string
  highlighted?: boolean
  /** With an id, the row is an `option` of a listbox (add workspace modal); `highlighted` = `aria-selected`. */
  optionId?: string
}) {
  const t = useT()
  const m = t.app.recent
  const { path, branch, lastOpened } = folder
  const name = basename(path)
  const age = openedAgo(lastOpened)
  const { platform } = window.api

  const onClick = (e: MouseEvent): void => {
    // ⌘-click (Ctrl on Windows/Linux) selects; a plain click still opens the folder.
    if (onToggle && (platform === 'darwin' ? e.metaKey : e.ctrlKey)) onToggle(path)
    else onOpen(path)
  }
  // Space selects (the button would open on keyup): both events are consumed.
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === ' ' && onToggle) {
      e.preventDefault()
      onToggle(path)
    }
  }
  const onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === ' ' && onToggle) e.preventDefault()
  }

  return (
    <li
      id={optionId}
      role={optionId ? 'option' : undefined}
      aria-selected={optionId ? highlighted : undefined}
      className={`recent-item${selected ? ' selected' : ''}${highlighted ? ' highlighted' : ''}`}
      data-selected={selected}
      data-path={path}
    >
      {onToggle && (
        <input
          type="checkbox"
          className="recent-check"
          // The keyboard selects with space on the row itself: the checkbox is no longer one more Tab stop per row.
          tabIndex={-1}
          checked={selected}
          onChange={() => onToggle(path)}
          aria-label={m.select(name)}
        />
      )}
      <button
        className="recent-open"
        title={path}
        aria-describedby={hintId}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
      >
        <FileIcon name={name} folder size={18} />
        <span className="recent-text">
          <span className="recent-line">
            <span className="recent-name ellipsis">{name}</span>
            {branch && (
              <span className="recent-branch ellipsis" title={t.app.branchTitle(branch)}>
                <Icon name="branch" />
                {branch}
              </span>
            )}
            <OpenFlag path={path} />
          </span>
          <span className="recent-line">
            <span className="recent-dir ellipsis">{dirname(path)}</span>
            {age && <span className="recent-age">{age}</span>}
          </span>
        </span>
        {selected && <span className="sr-only">{m.selected}</span>}
      </button>
      <IconButton
        className="recent-remove"
        title={m.removeTitle}
        label={m.removeAria(name)}
        onClick={() => removeRecentFolder(path)}
        glyph="close"
      />
    </li>
  )
}
