import { useId, useState, type KeyboardEvent } from 'react'
import { useStore } from '../store'
import { addWorkspace } from '../workspaceActions'
import { filterRecents } from '../lib/recentFilter'
import { Icon } from './common/Icon'
import { Modal } from './common/Modal'
import { useActiveDescendant } from './common/useActiveDescendant'
import { RecentRow } from './RecentRow'
import { closeAddWorkspace } from '../overlayActions'
import { useT } from '../i18n'
import { Button } from './common/Button'

/**
 * "Open folder as workspace": filterable recents (↑/↓ + Enter) and, in the footer, the native dialog. Closes on pick;
 * a folder already open in another workspace is focused by main.
 */
export function AddWorkspaceModal() {
  const t = useT()
  const m = t.app.addWorkspace
  const folders = useStore((s) => s.recentFolders)
  const [query, setQuery] = useState('')
  const listId = useId()

  const shown = filterRecents(folders, query)
  const {
    index,
    activeId,
    onKeyDown: onNavKeyDown
  } = useActiveDescendant({
    count: shown.length,
    resetKey: query,
    idOf: (i) => `${listId}-${i}`
  })

  const open = (path?: string): void => {
    closeAddWorkspace()
    void addWorkspace(path)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (onNavKeyDown(e)) return
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (shown[index]) open(shown[index].path)
    }
  }

  return (
    <Modal
      title={t.app.openFolderAsWorkspace}
      onClose={closeAddWorkspace}
      className="add-workspace-modal"
      testId="add-workspace-modal"
      footer={
        <Button variant="primary" data-action="add-workspace-browse" onClick={() => open()}>
          <Icon name="folder" />
          {m.browse}
        </Button>
      }
    >
      <div className="add-workspace-filter">
        <Icon name="search" />
        <input
          data-autofocus
          className="add-workspace-input"
          placeholder={m.filter}
          aria-label={m.filter}
          role="combobox"
          aria-expanded={shown.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      {shown.length === 0 ? (
        <p className="add-workspace-empty">{folders.length === 0 ? t.app.noRecentFolders : m.noMatch}</p>
      ) : (
        <ul id={listId} role="listbox" aria-label={t.app.recentFolders} className="recent-list add-workspace-list">
          {shown.map((folder, i) => (
            <RecentRow
              key={folder.path}
              folder={folder}
              highlighted={i === index}
              optionId={`${listId}-${i}`}
              onOpen={open}
            />
          ))}
        </ul>
      )}
    </Modal>
  )
}
