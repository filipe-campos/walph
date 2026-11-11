import { memo, useEffect, useId, useMemo, useRef, useState } from 'react'
import { compareText } from '@shared/i18n'
import type { ClaudeSlashCommand } from '@shared/types'
import {
  FAVORITE_COMMAND_ICONS,
  FAVORITE_COMMAND_ICON_LABELS,
  MAX_FAVORITE_COMMANDS,
  type FavoriteCommandIcon
} from '@shared/favoriteCommands'
import {
  addFavoriteCommand,
  loadSlashCommands,
  removeFavoriteCommand,
  reorderFavoriteCommand,
  runFavoriteCommand
} from '../../claudePromptActions'
import { focusPrompt } from '../../claudePromptBridge'
import { useT } from '../../i18n'
import { useStore } from '../../store'
import { Icon } from '../common/Icon'
import { useAsync } from '../common/useAsync'
import { useReorderDrag } from '../common/useReorderDrag'
import { Button } from '../common/Button'

const DRAG_TYPE = 'application/x-walph-favorite-command'

const SCOPE_ORDER: Record<ClaudeSlashCommand['scope'], number> = { project: 0, user: 1, builtin: 2 }

/** Two-step "+" panel (design system): 1 · Command (those not yet favorites) and 2 · Icon, with a preview. */
function AddPopover({
  conversationId,
  commands,
  taken,
  onClose
}: {
  conversationId: string
  commands: ClaudeSlashCommand[]
  taken: ReadonlySet<string>
  onClose: (refocus: boolean) => void
}) {
  const t = useT()
  const m = t.claude.favorites
  // The `init` list may be stale (new file in .claude/commands): rereads on open and uses the new one if it comes.
  const fresh = useAsync(() => loadSlashCommands(conversationId), [conversationId]).value
  const source = fresh ?? commands
  const available = useMemo(
    () =>
      source
        .filter((c) => !taken.has(c.name))
        .sort((a, b) => SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] || compareText(a.name, b.name)),
    [source, taken]
  )
  const searchRef = useRef<HTMLInputElement>(null)
  // `data-autofocus` only works in Modal/useMenuPopup: here focus goes to the search on open.
  const hasAvailable = available.length > 0
  useEffect(() => {
    if (hasAvailable) searchRef.current?.focus()
  }, [hasAvailable])
  const [query, setQuery] = useState('')
  const listId = useId()
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return available
    return available.filter((c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))
  }, [available, query])
  const [picked, setPicked] = useState<string | null>(null)
  const [icon, setIcon] = useState<FavoriteCommandIcon>('bolt')
  // The chosen one drops out of the list (reload or filter): falls back to the first visible one.
  const cmd = picked && shown.some((c) => c.name === picked) ? picked : (shown[0]?.name ?? null)
  const favorites = useStore((s) => s.claudeFavoriteCommands)
  const full = favorites.length >= MAX_FAVORITE_COMMANDS

  const add = (): void => {
    if (!cmd || full) return
    void addFavoriteCommand({ name: cmd, icon })
    onClose(true)
  }

  return (
    <div className="claude-favpop" role="dialog" aria-label={m.newFavorite} data-testid="claude-favorite-add-dialog">
      <div className="claude-menu-head">{m.stepCommand}</div>
      {available.length > 0 && (
        <input
          ref={searchRef}
          role="searchbox"
          aria-controls={listId}
          className="claude-model-search"
          value={query}
          placeholder={m.searchCommand}
          aria-label={m.searchCommand}
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && shown[0]) {
              e.preventDefault()
              setPicked(shown[0].name)
            }
          }}
        />
      )}
      {available.length > 0 ? (
        <div id={listId} className="claude-favlist" role="radiogroup" aria-label={m.command}>
          {shown.length === 0 && <div className="empty-line muted">{m.noneFound}</div>}
          {shown.map((c) => (
            <button
              key={c.name}
              type="button"
              role="radio"
              aria-checked={cmd === c.name}
              className="claude-option"
              data-command={c.name}
              onClick={() => setPicked(c.name)}
            >
              <span className="claude-option-text">
                <span className="claude-option-title claude-mono">/{c.name}</span>
                {c.description && <span className="claude-option-desc">{c.description}</span>}
              </span>
              {cmd === c.name && <i className="codicon codicon-check" aria-hidden="true" />}
            </button>
          ))}
        </div>
      ) : (
        <p className="claude-favnote">{commands.length === 0 && !fresh ? m.commandsPending : m.allFavorited}</p>
      )}
      <div className="claude-favsep" />
      <div className="claude-menu-head">{m.stepIcon}</div>
      <div className="claude-favicons" role="radiogroup" aria-label={m.icon}>
        {FAVORITE_COMMAND_ICONS.map((name) => (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={icon === name}
            aria-label={FAVORITE_COMMAND_ICON_LABELS[name]}
            title={FAVORITE_COMMAND_ICON_LABELS[name]}
            data-icon={name}
            className={`claude-favicon${icon === name ? ' on' : ''}`}
            onClick={() => setIcon(name)}
          >
            <Icon name={name} />
          </button>
        ))}
      </div>
      <div className="claude-favfoot">
        {cmd ? (
          <span className="claude-favpreview">
            <span className="claude-favbtn preview" aria-hidden="true">
              <Icon name={icon} />
            </span>
            <span className="claude-mono ellipsis">/{cmd}</span>
          </span>
        ) : (
          <span />
        )}
        <Button
          variant="primary"
          size="sm"
          type="button"
          disabled={!cmd || full}
          title={full ? m.maxFavorites(MAX_FAVORITE_COMMANDS) : undefined}
          onClick={add}
        >
          {m.add}
        </Button>
      </div>
    </div>
  )
}

/**
 * Favorite commands (design system): icon strip right above the field. A click runs the command directly in the
 * conversation in view; the "x" on hover removes it from favorites; the "+" opens the panel to pin another. The list
 * belongs to the folder (stored in main), the same in every session of the workspace.
 */
export const FavoriteCommands = memo(function FavoriteCommands({
  conversationId,
  commands,
  active
}: {
  conversationId: string
  commands: ClaudeSlashCommand[]
  /** Pane in view: when hidden, the "+" panel does not stay open (nor hold the Esc). */
  active: boolean
}) {
  const t = useT()
  const m = t.claude.favorites
  const favorites = useStore((s) => s.claudeFavoriteCommands)
  const [openState, setOpen] = useState(false)
  const open = openState && active
  const taken = useMemo(() => new Set(favorites.map((f) => f.name)), [favorites])
  const rootRef = useRef<HTMLDivElement>(null)
  const names = useMemo(() => favorites.map((f) => f.name), [favorites])
  const reorder = useReorderDrag({
    containerRef: rootRef,
    type: DRAG_TYPE,
    axis: 'grid',
    ids: names,
    onMove: (name, to) => void reorderFavoriteCommand(name, to)
  })
  const addRef = useRef<HTMLButtonElement>(null)

  const close = (refocus: boolean): void => {
    setOpen(false)
    if (refocus) addRef.current?.focus()
  }

  // Esc and an outside click close (Esc returns focus to the "+"); the Esc does not reach the field (which would
  // interrupt Claude).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      // Only the Esc from inside the strip: the rest (interrupting Claude, closing the palette) follows the normal
      // path.
      if (e.key !== 'Escape' || !rootRef.current?.contains(e.target as Node)) return
      e.stopPropagation()
      e.preventDefault()
      setOpen(false)
      addRef.current?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const describe = (name: string): string => {
    const info = commands.find((c) => c.name === name)
    return `/${name}${info?.description ? ` — ${info.description}` : ''}`
  }

  return (
    <div
      className={`claude-favs${reorder.dragging ? ' dragging' : ''}${reorder.settling ? ' settling' : ''}`}
      role="toolbar"
      aria-label={m.toolbar}
      ref={rootRef}
      data-testid="claude-favorite-commands"
      {...reorder.dropProps}
    >
      {favorites.map((f, i) => (
        <span
          key={f.name}
          className={`claude-fav-item${reorder.draggingId === f.name ? ' dragging' : ''}`}
          data-favorite-command={f.name}
          draggable
          style={reorder.itemStyle(i)}
          {...reorder.itemProps(f.name, i)}
        >
          <button
            type="button"
            className="claude-favbtn"
            title={m.runTitle(describe(f.name))}
            aria-label={m.run(f.name)}
            onClick={() => void runFavoriteCommand(conversationId, f.name)}
          >
            <Icon name={f.icon} />
          </button>
          <button
            type="button"
            className="claude-fav-x"
            title={m.remove}
            aria-label={m.removeCommand(f.name)}
            onClick={() => {
              void removeFavoriteCommand(f.name)
              // The focused button leaves the DOM: focus returns to the field (otherwise the `claudeFocus` context gets
              // stuck).
              focusPrompt()
            }}
          >
            <Icon name="close" />
          </button>
        </span>
      ))}
      <button
        ref={addRef}
        type="button"
        className={`claude-favbtn add${open ? ' on' : ''}`}
        title={m.addFavorite}
        aria-label={m.addFavorite}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="claude-favorite-add"
        onClick={() => setOpen(!open)}
      >
        <Icon name="plus" />
      </button>
      {favorites.length === 0 && <span className="claude-favs-hint">{m.emptyHint}</span>}
      {open && <AddPopover conversationId={conversationId} commands={commands} taken={taken} onClose={close} />}
    </div>
  )
})
