import { useId, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { CommandId } from '@shared/commands'
import type { Messages } from '@shared/i18n'
import { useStore } from '../store'
import { openManyWorkspaces, startWithClaude } from '../workspaceActions'
import { executeCommand } from '../commands/registry'
import { basename } from '../lib/path'
import { shortcutLabel } from '../lib/keybinding'
import { useShortcutLabel } from './common/useShortcutLabel'
import { useRovingFocus } from './common/useRovingFocus'
import { highlightFolders, openButtonLabel, openedAgo, visibleSelection } from '../lib/welcomeRecents'
import { toggleSelected } from '../lib/toggleSelected'
import { Icon, type IconName } from './common/Icon'
import { OpenFlag, RecentRow } from './RecentRow'
import { FileIcon } from './common/FileIcon'
import { Logo } from './common/Logo'
import { showPanel } from '../terminalActions'
import { openWorkspace, pickAndOpenWorkspace } from '../workspaceLifecycle'
import { useT } from '../i18n'
import { Button } from './common/Button'
import { IconButton } from './common/IconButton'

const WELCOME_SHORTCUTS: [(t: Messages) => string, CommandId][] = [
  [(t) => t.app.welcome.shortcuts.commands, 'workbench.showCommandPalette'],
  [(t) => t.app.welcome.shortcuts.openFile, 'workbench.quickOpen'],
  [(t) => t.app.welcome.shortcuts.search, 'view.search'],
  [(t) => t.app.welcome.shortcuts.terminal, 'terminal.toggle'],
  [() => 'Claude Code', 'claude.focus']
]

/** Staggered entrance: each block rises 4px with `duration-stagger` between them (max 6 steps). */
const step = (n: number): CSSProperties => ({ '--step': n }) as CSSProperties

function Action({ icon, label, id, onClick }: { icon: IconName; label: string; id: CommandId; onClick: () => void }) {
  const shortcut = useShortcutLabel(id)
  return (
    <button className="welcome-action" data-action={id} onClick={onClick}>
      <Icon name={icon} />
      <span className="welcome-action-label">{label}</span>
      {shortcut && <kbd className="welcome-action-kbd">{shortcut}</kbd>}
    </button>
  )
}

/** Highlight strip: up to the 4 most recent folders, one click opens (the list below keeps multiple selection). */
function RecentHighlights() {
  const t = useT()
  const folders = useStore((s) => s.recentFolders)
  const cards = highlightFolders(folders)
  const titleId = useId()
  if (cards.length === 0) return null
  return (
    <section className="welcome-highlights" aria-labelledby={titleId}>
      <h2 id={titleId} className="welcome-caption welcome-in" style={step(1)}>
        {t.app.welcome.continueTitle}
      </h2>
      <ul className="recent-cards">
        {cards.map((folder, i) => {
          const name = basename(folder.path)
          const age = openedAgo(folder.lastOpened)
          return (
            <li key={folder.path} className="welcome-in" style={step(1 + i)}>
              <button
                className="recent-card"
                data-path={folder.path}
                title={folder.path}
                onClick={() => void openWorkspace(folder.path)}
              >
                <span className="recent-card-head">
                  <FileIcon name={name} folder size={20} />
                  <span className="recent-card-name ellipsis">{name}</span>
                  <OpenFlag path={folder.path} />
                </span>
                {folder.branch && (
                  <span className="recent-branch recent-card-branch ellipsis" title={t.app.branchTitle(folder.branch)}>
                    <Icon name="branch" />
                    {folder.branch}
                  </span>
                )}
                {age && <span className="recent-age">{age}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function RecentFolders({
  selected,
  onToggle,
  onClear
}: {
  selected: string[]
  onToggle: (path: string) => void
  onClear: () => void
}) {
  const t = useT()
  const m = t.app.welcome
  const folders = useStore((s) => s.recentFolders)
  const [busy, setBusy] = useState(false)
  const hintId = useId()
  const chosen = new Set(selected)

  const openMany = async (): Promise<void> => {
    setBusy(true)
    const opened = await openManyWorkspaces(selected.length > 0 ? selected : undefined)
    setBusy(false)
    if (opened > 0) onClear()
  }

  // Each row is a button (Tab goes through all of them): the arrows give the short path between them.
  const onListKeyDown = useRovingFocus({ orientation: 'vertical', selector: '.recent-open' })

  return (
    <section className="welcome-recent welcome-in" style={step(6)} aria-label={t.app.recentFolders}>
      <h2 className="welcome-caption">{m.recentTitle}</h2>
      {folders.length === 0 ? (
        <p className="recent-empty">{t.app.noRecentFolders}</p>
      ) : (
        <>
          <p id={hintId} className="recent-hint">
            {m.selectHint(window.api.platform === 'darwin' ? '⌘' : 'Ctrl')}
          </p>
          <ul className="recent-list" onKeyDown={onListKeyDown}>
            {folders.map((folder) => (
              <RecentRow
                key={folder.path}
                folder={folder}
                selected={chosen.has(folder.path)}
                onToggle={onToggle}
                onOpen={(path) => void openWorkspace(path)}
                hintId={hintId}
              />
            ))}
          </ul>
          <div className="recent-footer">
            <Button variant="primary" className="recent-open-many" disabled={busy} onClick={() => void openMany()}>
              {openButtonLabel(selected.length)}
            </Button>
            {selected.length > 0 && (
              <button className="recent-clear" onClick={onClear}>
                {m.clearSelection}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  )
}

/** "Start with Claude": Enter asks for the folder (the selected recent, or main's dialog) and sends the request. */
function ClaudeStart({ root }: { root: string | null }) {
  const t = useT()
  const m = t.app.welcome
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const targetId = useId()

  const send = async (): Promise<void> => {
    const prompt = text.trim()
    if (!prompt || sending) return
    setSending(true)
    const ok = await startWithClaude(root, prompt)
    setSending(false)
    if (ok) setText('')
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    // Enter sends; Shift+Enter breaks the line; a composition (IME) Enter only confirms the text.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <section className="welcome-claude-section welcome-in" style={step(6)} aria-label={m.claudeTitle}>
      <h2 className="welcome-caption">{m.claudeTitle}</h2>
      <div className="welcome-claude neon">
        <textarea
          className="welcome-claude-input"
          rows={2}
          value={text}
          placeholder={m.claudePlaceholder}
          aria-label={m.claudeAria}
          aria-describedby={targetId}
          readOnly={sending}
          aria-busy={sending}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <IconButton
          className="welcome-claude-send"
          label={m.sendToClaude}
          disabled={sending || !text.trim()}
          onClick={() => void send()}
          glyph="send"
        />
      </div>
      <p id={targetId} className="welcome-claude-target">
        {root ? m.targetIn(basename(root)) : m.targetPick}
      </p>
    </section>
  )
}

function Shortcuts() {
  const t = useT()
  const keybindings = useStore((s) => s.keybindings)
  const { platform } = window.api
  return (
    <dl className="shortcuts welcome-in" style={step(2)}>
      {WELCOME_SHORTCUTS.map(([label, id]) => {
        const shortcut = shortcutLabel(keybindings, id, platform)
        // A command without a shortcut (removed in keybindings.json) is left out of the list.
        return shortcut ? (
          <div key={id} className="shortcut">
            <dt>{label(t)}</dt>
            <dd>
              <kbd>{shortcut}</kbd>
            </dd>
          </div>
        ) : null
      })}
    </dl>
  )
}

/** No folder: start actions, "Start with Claude" and the recents (with multiple selection). */
function WelcomeStart() {
  const t = useT()
  const m = t.app.welcome
  const folders = useStore((s) => s.recentFolders)
  const [picked, setPicked] = useState<string[]>([])
  // A removed recent drops out of the selection without an effect: filter on read.
  const selected = visibleSelection(picked, folders)

  return (
    <div className="welcome-shell">
      <div className="welcome">
        <div className="welcome-grid">
          <div className="welcome-brand welcome-in" style={step(0)}>
            <span className="welcome-logo">
              <Logo size={52} />
            </span>
            <p className="welcome-tag">{m.tagline}</p>
          </div>
          <RecentHighlights />
          <div className="welcome-col">
            <div className="welcome-actions welcome-in" style={step(5)}>
              <Action
                icon="folder"
                label={m.openFolder}
                id="workspace.add"
                onClick={() => void pickAndOpenWorkspace()}
              />
              <Action icon="branch" label={m.clone} id="git.clone" onClick={() => void executeCommand('git.clone')} />
              {/* Welcome is the empty workspace: the terminal opens in the user's home (null `cwd`). */}
              <Action icon="terminal" label={m.terminal} id="terminal.toggle" onClick={() => showPanel('terminal')} />
              <Action
                icon="layers"
                label={m.newWindow}
                id="workbench.newWindow"
                onClick={() => void executeCommand('workbench.newWindow')}
              />
            </div>
            <ClaudeStart root={selected[0] ?? null} />
          </div>
          <div className="welcome-col">
            <RecentFolders
              selected={selected}
              onToggle={(path) => setPicked((p) => toggleSelected(visibleSelection(p, folders), path))}
              onClear={() => setPicked([])}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Start screen of the editor area (aurora background, logo and staggered entrance). No folder: start actions and
 * recents;
 * with a folder and no open tab: the main shortcuts.
 */
export function Welcome() {
  const hasRoot = useStore((s) => !!s.root)

  if (!hasRoot) return <WelcomeStart />

  return (
    <div className="welcome welcome-compact">
      <div className="welcome-brand welcome-in" style={step(0)}>
        <Logo size={40} />
      </div>
      <Shortcuts />
    </div>
  )
}
